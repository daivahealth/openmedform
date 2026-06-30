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
import { PatientHeaderBar } from '@/components/forms/patient-header-bar';

interface PatientContext {
  patientName?: string;
  patientMrn?: string;
  age?: string;
  gender?: string;
  encounterId?: string;
  department?: string;
  consultantName?: string;
}

export default function FormFillPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.formSlug as string;

  const { data: form, isLoading: formLoading } = useFormBySlug(slug);
  const createSubmission = useCreateSubmission(form?.id ?? '');

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [patientContext, setPatientContext] = useState<PatientContext>({});
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const updateSubmission = useUpdateSubmission(submissionId ?? '');
  const completeSubmission = useCompleteSubmission(submissionId ?? '');

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const autoStarted = useRef(false);

  const isPatientForm = form?.formType !== 'NON_PATIENT';

  const startSubmission = useCallback(async (ctx?: PatientContext) => {
    if (!form) return;
    const result = await createSubmission.mutateAsync({
      patientMrn: ctx?.patientMrn?.trim() || undefined,
      encounterId: ctx?.encounterId?.trim() || undefined,
      ...(ctx && Object.values(ctx).some(v => v?.trim()) ? { patientContext: ctx } : {}),
    });
    setSubmissionId(result.id);
    setStarted(true);
  }, [form, createSubmission]);

  useEffect(() => {
    if (form && !isPatientForm && !autoStarted.current && !started) {
      autoStarted.current = true;
      startSubmission();
    }
  }, [form, isPatientForm, started, startSubmission]);

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
          <Button variant="outline" onClick={() => router.push('/submissions')}>
            Back to Responses
          </Button>
          <Button
            onClick={() => {
              setStarted(false);
              setCompleted(false);
              setSubmissionId(null);
              setPatientContext({});
              autoStarted.current = false;
            }}
          >
            Fill Again
          </Button>
        </div>
      </div>
    );
  }

  if (!started && isPatientForm) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <h1 className="text-2xl font-bold tracking-tight">{form.name}</h1>
        {form.description && (
          <p className="mt-1 text-muted-foreground">{form.description}</p>
        )}

        <div className="mt-6 space-y-4 rounded-lg border bg-white p-6">
          <p className="text-sm font-medium text-muted-foreground">
            Patient Information (optional)
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 grid gap-2">
              <Label htmlFor="patient-name">Patient Name</Label>
              <Input
                id="patient-name"
                placeholder="e.g., John Doe"
                value={patientContext.patientName ?? ''}
                onChange={(e) =>
                  setPatientContext((p) => ({ ...p, patientName: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient-mrn">MRN</Label>
              <Input
                id="patient-mrn"
                placeholder="e.g., MRN-001234"
                value={patientContext.patientMrn ?? ''}
                onChange={(e) =>
                  setPatientContext((p) => ({ ...p, patientMrn: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="encounter-id">Encounter ID</Label>
              <Input
                id="encounter-id"
                placeholder="e.g., ENC-2024-001"
                value={patientContext.encounterId ?? ''}
                onChange={(e) =>
                  setPatientContext((p) => ({ ...p, encounterId: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient-age">Age</Label>
              <Input
                id="patient-age"
                placeholder="e.g., 45"
                value={patientContext.age ?? ''}
                onChange={(e) =>
                  setPatientContext((p) => ({ ...p, age: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient-gender">Gender</Label>
              <Input
                id="patient-gender"
                placeholder="e.g., Male"
                value={patientContext.gender ?? ''}
                onChange={(e) =>
                  setPatientContext((p) => ({ ...p, gender: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient-department">Department</Label>
              <Input
                id="patient-department"
                placeholder="e.g., Cardiology"
                value={patientContext.department ?? ''}
                onChange={(e) =>
                  setPatientContext((p) => ({ ...p, department: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient-consultant">Consultant</Label>
              <Input
                id="patient-consultant"
                placeholder="e.g., Dr. Smith"
                value={patientContext.consultantName ?? ''}
                onChange={(e) =>
                  setPatientContext((p) => ({
                    ...p,
                    consultantName: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => startSubmission(patientContext)}
            disabled={createSubmission.isPending}
          >
            {createSubmission.isPending ? 'Starting...' : 'Start Assessment'}
          </Button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const schema = form.currentVersion?.schema ?? { display: 'form', components: [] };

  return (
    <div className="mx-auto max-w-4xl py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{form.name}</h1>
      </div>

      {isPatientForm && <PatientHeaderBar context={patientContext} />}

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
