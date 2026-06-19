'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSubmission } from '@/hooks/use-submissions';
import dynamic from 'next/dynamic';

const FormRendererWrapper = dynamic(
  () => import('@/components/forms/form-renderer-wrapper').then(m => ({ default: m.FormRendererWrapper })),
  { ssr: false, loading: () => <div className="flex h-[200px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> },
);
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download } from 'lucide-react';
import api from '@/lib/api';

const statusStyles: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  AMENDED: 'bg-amber-100 text-amber-800 border-amber-200',
  VOIDED: 'bg-red-100 text-red-600 border-red-200',
};

export default function SubmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: submission, isLoading } = useSubmission(id);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Submission not found</p>
      </div>
    );
  }

  const schema = (submission as any).formVersion?.schema ?? {
    display: 'form',
    components: [],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (submission.form?.id) {
                router.push(`/forms/${submission.form.id}/submissions`);
              } else {
                router.back();
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {submission.form?.name ?? 'Submission'}
              </h1>
              <Badge
                variant="outline"
                className={statusStyles[submission.status] ?? ''}
              >
                {submission.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              {submission.patientMrn && (
                <span>Patient: {submission.patientMrn}</span>
              )}
              {submission.submittedBy && (
                <span>By: {submission.submittedBy.fullName ?? submission.submittedBy.email}</span>
              )}
              <span>
                {new Date(submission.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {submission.status === 'COMPLETED' && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const response = await api.get(`/api/submissions/${id}/pdf`, {
                responseType: 'blob',
              });
              const url = window.URL.createObjectURL(new Blob([response.data]));
              const link = document.createElement('a');
              link.href = url;
              link.download = `submission-${id}.pdf`;
              link.click();
              window.URL.revokeObjectURL(url);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        )}
      </div>

      {submission.scores && Object.keys(submission.scores).length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="mb-2 font-semibold">Scores</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(submission.scores).map(([key, value]) => (
              <div key={key} className="rounded bg-white px-3 py-2 shadow-sm">
                <div className="text-xs text-muted-foreground">{key}</div>
                <div className="text-lg font-bold">{String(value)}</div>
              </div>
            ))}
            {submission.riskLevel && (
              <div className="rounded bg-white px-3 py-2 shadow-sm">
                <div className="text-xs text-muted-foreground">Risk Level</div>
                <div className="text-lg font-bold">{submission.riskLevel}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-white p-6">
        <FormRendererWrapper
          schema={schema}
          submission={submission.data}
          readOnly
        />
      </div>
    </div>
  );
}
