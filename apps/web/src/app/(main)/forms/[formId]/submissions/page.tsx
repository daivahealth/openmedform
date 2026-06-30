'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from '@/hooks/use-forms';
import { useSubmissions } from '@/hooks/use-submissions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, ExternalLink } from 'lucide-react';

const statusStyles: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  AMENDED: 'bg-amber-100 text-amber-800 border-amber-200',
  VOIDED: 'bg-red-100 text-red-600 border-red-200',
};

export default function SubmissionsPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.formId as string;

  const { data: form } = useForm(formId);
  const { data: submissions, isLoading } = useSubmissions(formId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/forms')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Responses{form ? `: ${form.name}` : ''}
            </h1>
            <p className="text-sm text-muted-foreground">
              All responses for this form
            </p>
          </div>
        </div>

        {form?.slug && form.status === 'PUBLISHED' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/fill/${form.slug}`)}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Fill Form
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Responses</CardTitle>
          <CardDescription>
            {submissions?.length ?? 0} total responses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">
                    Patient MRN
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    Submitted By
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Version</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr className="border-b">
                    <td className="px-4 py-8" colSpan={6}>
                      <div className="flex justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      </div>
                    </td>
                  </tr>
                ) : !submissions?.length ? (
                  <tr className="border-b">
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                        <FileText className="mb-2 h-8 w-8" />
                        <p>No responses yet</p>
                        {form?.slug && form.status === 'PUBLISHED' && (
                          <Button
                            variant="link"
                            size="sm"
                            className="mt-1"
                            onClick={() => router.push(`/fill/${form.slug}`)}
                          >
                            Fill this form
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => (
                    <tr key={sub.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">
                        {sub.patientMrn || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {sub.submittedBy?.fullName ?? sub.submittedBy?.email ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        v{sub.formVersion?.version ?? '?'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={statusStyles[sub.status] ?? ''}
                        >
                          {sub.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(sub.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/submissions/${sub.id}`)
                          }
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
