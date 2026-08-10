'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

/**
 * JSON Forms creation via the engine-targeted conversion pipeline
 * (POST /api/conversions). The job runs in the background on the API, so this
 * hook starts it, polls until it reaches REVIEW (or FAILED), then accepts it —
 * promoting the generated draft form to DRAFT and returning its id.
 */

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 90; // ~3 minutes

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ConversionJob {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'REVIEW' | 'COMPLETED' | 'FAILED';
  /** Pipeline stage of a RUNNING job — drives the dialog's live checklist. */
  stage?: string | null;
  /** Human detail for the active stage, e.g. "3 pages · claude". */
  stageDetail?: string | null;
  formId?: string | null;
  error?: string | null;
}

export interface CreateJsonFormsInput {
  file: File;
  /** Clinical category for the created form (same list the prompt route uses). */
  category?: string;
  /** Patient / Non-Patient. Omitted leaves the API's PATIENT default. */
  formType?: 'PATIENT' | 'NON_PATIENT';
  provider?: string;
  instructions?: string;
  /** Opt in to parsing an HTML mock-up's scripts for declarative config. */
  extractScriptConfig?: boolean;
  /**
   * Called with every polled snapshot of the job (including the first), so the
   * dialog can show live stage progress while the mutation is in flight.
   */
  onJobUpdate?: (job: ConversionJob) => void;
}

export function useCreateJsonFormsForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateJsonFormsInput): Promise<{ formId: string }> => {
      const formData = new FormData();
      formData.append('file', input.file);
      // The metadata that used to be the describe-a-form route's alone, so a
      // converted form is as complete in the list as a described one.
      if (input.category) formData.append('category', input.category);
      if (input.formType) formData.append('formType', input.formType);
      if (input.provider) formData.append('provider', input.provider);
      if (input.instructions) formData.append('instructions', input.instructions);
      // Only sent when true: the API treats anything else as off anyway, and
      // not sending it keeps the default path byte-identical.
      if (input.extractScriptConfig) formData.append('extractScriptConfig', 'true');

      const { data: job } = await api.post<ConversionJob>('/api/conversions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      let current = job;
      input.onJobUpdate?.(current);
      for (
        let i = 0;
        i < MAX_POLLS && (current.status === 'PENDING' || current.status === 'RUNNING');
        i++
      ) {
        await delay(POLL_INTERVAL_MS);
        const { data } = await api.get<ConversionJob>(`/api/conversions/${job.id}`);
        current = data;
        input.onJobUpdate?.(current);
      }

      if (current.status === 'FAILED') {
        throw new Error(current.error || 'The AI conversion failed. Please try again.');
      }
      if (current.status !== 'REVIEW' || !current.formId) {
        throw new Error(
          'The conversion is taking longer than expected. Check the conversion job and try again.',
        );
      }

      const { data: accepted } = await api.post<{ formId: string }>(
        `/api/conversions/${job.id}/accept`,
      );
      return { formId: accepted.formId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}
