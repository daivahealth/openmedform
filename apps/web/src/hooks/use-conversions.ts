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

/**
 * Poll a started job to completion, then accept it.
 *
 * Shared by both creation routes: once a job exists, a described form and an
 * uploaded one are watched identically, so this knows nothing about how the
 * job began.
 */
async function awaitJob(
  job: ConversionJob,
  onJobUpdate?: (job: ConversionJob) => void,
): Promise<{ formId: string }> {
  let current = job;
  onJobUpdate?.(current);

  for (
    let i = 0;
    i < MAX_POLLS && (current.status === 'PENDING' || current.status === 'RUNNING');
    i++
  ) {
    await delay(POLL_INTERVAL_MS);
    const { data } = await api.get<ConversionJob>(`/api/conversions/${job.id}`);
    current = data;
    onJobUpdate?.(current);
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
}

export function useCreateJsonFormsForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateJsonFormsInput): Promise<{ formId: string }> => {
      const formData = new FormData();
      formData.append('file', input.file);
      formData.append('engine', 'jsonforms');
      if (input.provider) formData.append('provider', input.provider);
      if (input.instructions) formData.append('instructions', input.instructions);
      // Only sent when true: the API treats anything else as off anyway, and
      // not sending it keeps the default path byte-identical.
      if (input.extractScriptConfig) formData.append('extractScriptConfig', 'true');

      const { data: job } = await api.post<ConversionJob>('/api/conversions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      return awaitJob(job, input.onJobUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

export interface CreateFromPromptInput {
  name: string;
  prompt: string;
  category?: string;
  provider?: string;
  onJobUpdate?: (job: ConversionJob) => void;
}

/**
 * Create a form from a description, via the job pipeline.
 *
 * Deliberately not `POST /api/forms/from-prompt`, which does the same work
 * synchronously: that call holds one request open for the entire LLM run, so
 * the dialog can only show a spinner and has no way to report where the work
 * has got to. Going through a job gives the same live stage checklist the file
 * route has, and the run survives the dialog being closed.
 */
export function useCreateFormFromPromptJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFromPromptInput): Promise<{ formId: string }> => {
      const { data: job } = await api.post<ConversionJob>('/api/conversions/from-prompt', {
        name: input.name,
        prompt: input.prompt,
        ...(input.category ? { category: input.category } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
      });

      return awaitJob(job, input.onJobUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}
