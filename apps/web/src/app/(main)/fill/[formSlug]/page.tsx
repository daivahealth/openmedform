'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormBySlug } from '@/hooks/use-forms';
import {
  useCreateSubmission,
  useUpdateSubmission,
  useCompleteSubmission,
} from '@/hooks/use-submissions';
import dynamic from 'next/dynamic';

const FormRendererWrapper = dynamic(
  () => import('@/components/forms/form-renderer-wrapper').then(m => ({ default: m.FormRendererWrapper })),
  { ssr: false, loading: () => <div className="flex h-[200px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> },
);
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle } from 'lucide-react';

export default function FormFillPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.formSlug as string;

  const { data: form, isLoading: formLoading } = useFormBySlug(slug);
  const createSubmission = useCreateSubmission(form?.id ?? '');

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [patientMrn, setPatientMrn] = useState('');
  const [encounterId, setEncounterId] = useState('');
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const updateSubmission = useUpdateSubmission(submissionId ?? '');
  const completeSubmission = useCompleteSubmission(submissionId ?? '');

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleStart = useCallback(async () => {
    if (!form) return;
    const result = await createSubmission.mutateAsync({
      patientMrn: patientMrn.trim() || undefined,
      encounterId: encounterId.trim() || undefined,
    });
    setSubmissionId(result.id);
    setStarted(true);
  }, [form, createSubmission, patientMrn, encounterId]);

  const handleChange = useCallback(
    (data: object) => {
      if (!submissionId) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        updateSubmission.mutate({ data });
      }, 3000);
    },
    [submissionId, updateSubmission],
  );

  const handleSubmit = useCallback(
    async (submissionData: object) => {
      if (!submissionId) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const data = (submissionData as { data?: object }).data ?? submissionData;
      await updateSubmission.mutateAsync({ data });
      await completeSubmission.mutateAsync();
      setCompleted(true);
    },
    [submissionId, updateSubmission, completeSubmission],
  );

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  if (formLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Form not found or not published</p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
        <h2 className="mt-4 text-2xl font-bold">Submission Complete</h2>
        <p className="mt-2 text-muted-foreground">
          Your response has been recorded successfully.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push('/forms')}>
            Back to Forms
          </Button>
          <Button
            onClick={() => {
              setStarted(false);
              setCompleted(false);
              setSubmissionId(null);
              setPatientMrn('');
              setEncounterId('');
            }}
          >
            Fill Again
          </Button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <h1 className="text-2xl font-bold tracking-tight">{form.name}</h1>
        {form.description && (
          <p className="mt-1 text-muted-foreground">{form.description}</p>
        )}

        <div className="mt-6 space-y-4 rounded-lg border bg-white p-6">
          <div className="grid gap-2">
            <Label htmlFor="patient-mrn">Patient MRN (optional)</Label>
            <Input
              id="patient-mrn"
              placeholder="e.g., MRN-001234"
              value={patientMrn}
              onChange={(e) => setPatientMrn(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="encounter-id">Encounter ID (optional)</Label>
            <Input
              id="encounter-id"
              placeholder="e.g., ENC-2024-001"
              value={encounterId}
              onChange={(e) => setEncounterId(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleStart}
            disabled={createSubmission.isPending}
          >
            {createSubmission.isPending ? 'Starting...' : 'Start Assessment'}
          </Button>
        </div>
      </div>
    );
  }

  const schema = form.currentVersion?.schema ?? { display: 'form', components: [] };

  return (
    <div className="mx-auto max-w-4xl py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{form.name}</h1>
        {patientMrn && (
          <p className="text-sm text-muted-foreground">
            Patient: {patientMrn}
            {encounterId && ` | Encounter: ${encounterId}`}
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-white p-6">
        <FormRendererWrapper
          schema={schema}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
