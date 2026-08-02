'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Inbox, Plus, FileText, Trash2, Loader2 } from 'lucide-react';
import { useForms } from '@/hooks/use-forms';
import {
  useVoidSubmission,
  useDeleteSubmissionPermanently,
} from '@/hooks/use-submissions';
import { useAuth } from '@/providers/auth-provider';
import { Input } from '@/components/ui/input';

interface Submission {
  id: string;
  formId: string;
  status: string;
  patientMrn?: string;
  riskLevel?: string;
  createdAt: string;
  form?: { id: string; name: string; slug: string };
  submittedBy?: { id: string; fullName: string; email: string };
  formVersion?: { id: string; version: number };
}

const statusStyles: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  AMENDED: 'bg-amber-100 text-amber-800 border-amber-200',
  VOIDED: 'bg-red-100 text-red-600 border-red-200',
};

function useAllSubmissions(includeVoided: boolean) {
  return useQuery<Submission[]>({
    queryKey: ['all-submissions', includeVoided],
    queryFn: async () => {
      const { data } = await api.get('/api/submissions', {
        params: includeVoided ? { includeVoided: 'true' } : undefined,
      });
      return data;
    },
  });
}

export default function AllSubmissionsPage() {
  const router = useRouter();
  const [showVoided, setShowVoided] = useState(false);
  const { data: submissions, isLoading } = useAllSubmissions(showVoided);
  const { data: forms } = useForms();
  const { user } = useAuth();
  const [pickFormOpen, setPickFormOpen] = useState(false);

  // Only an admin may destroy a record; everyone can void their own. The API
  // enforces both — this just avoids offering an action that would 403.
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const [removing, setRemoving] = useState<Submission | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [removeError, setRemoveError] = useState('');
  const voidSubmission = useVoidSubmission();
  const deletePermanently = useDeleteSubmissionPermanently();
  const busy = voidSubmission.isPending || deletePermanently.isPending;

  function closeRemove() {
    setRemoving(null);
    setConfirmText('');
    setRemoveError('');
  }

  async function runRemoval(permanent: boolean) {
    if (!removing) return;
    setRemoveError('');
    try {
      if (permanent) await deletePermanently.mutateAsync(removing.id);
      else await voidSubmission.mutateAsync(removing.id);
      closeRemove();
    } catch (err) {
      setRemoveError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Could not remove this record. Please try again.',
      );
    }
  }

  const publishedForms = forms?.filter((f) => f.status === 'PUBLISHED') ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Records</h1>
          <p className="text-sm text-muted-foreground">
            All form records across your organization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showVoided}
              onChange={(e) => setShowVoided(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Show deleted
          </label>
          <Button onClick={() => setPickFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Fill a Form
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Records</CardTitle>
          <CardDescription>
            {submissions?.length ?? 0} total records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Form</th>
                  <th className="px-4 py-3 text-left font-medium">Patient MRN</th>
                  <th className="px-4 py-3 text-left font-medium">Submitted By</th>
                  <th className="px-4 py-3 text-left font-medium">Version</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr className="border-b">
                    <td className="px-4 py-8" colSpan={7}>
                      <div className="flex justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      </div>
                    </td>
                  </tr>
                ) : !submissions?.length ? (
                  <tr className="border-b">
                    <td className="px-4 py-3" colSpan={7}>
                      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                        <Inbox className="mb-2 h-8 w-8" />
                        <p>No records yet</p>
                        <p className="mt-1 text-xs">
                          Click &quot;Fill a Form&quot; to fill a published form
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => (
                    <tr key={sub.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        {sub.form?.name ?? '—'}
                      </td>
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
                          onClick={() => router.push(`/submissions/${sub.id}`)}
                        >
                          View
                        </Button>
                        {sub.status !== 'VOIDED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete record ${sub.patientMrn ?? sub.id}`}
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setRemoving(sub);
                              setConfirmText('');
                              setRemoveError('');
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!removing} onOpenChange={(open) => !open && closeRemove()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this record?</DialogTitle>
            <DialogDescription>
              {removing?.form?.name}
              {removing?.patientMrn ? ` — ${removing.patientMrn}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Delete</p>
              <p className="mt-1 text-muted-foreground">
                Removes it from this list. This is a clinical record, so it is kept and
                stays available for audit &mdash; tick &ldquo;Show deleted&rdquo; to see it
                again.
              </p>
            </div>

            {isAdmin && (
              <div className="rounded-md border border-destructive/40 p-3 text-sm">
                <p className="font-medium text-destructive">Delete permanently</p>
                <p className="mt-1 text-muted-foreground">
                  Erases the record and its data for good. This cannot be undone; only the
                  audit log will show it existed. Type <strong>DELETE</strong> to confirm.
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="mt-2"
                  aria-label="Type DELETE to confirm permanent deletion"
                />
              </div>
            )}

            {removeError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {removeError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={closeRemove} disabled={busy}>
              Cancel
            </Button>
            <div className="flex gap-2">
              {isAdmin && (
                <Button
                  variant="destructive"
                  disabled={busy || confirmText !== 'DELETE'}
                  onClick={() => runRemoval(true)}
                >
                  {deletePermanently.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete permanently
                </Button>
              )}
              <Button disabled={busy} onClick={() => runRemoval(false)}>
                {voidSubmission.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pickFormOpen} onOpenChange={setPickFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select a Form to Fill</DialogTitle>
            <DialogDescription>
              Choose a published form to fill.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {publishedForms.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No published forms available. Publish a form first.
              </p>
            ) : (
              <div className="space-y-2">
                {publishedForms.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => {
                      setPickFormOpen(false);
                      router.push(`/fill/${form.slug}`);
                    }}
                    className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{form.name}</span>
                        <Badge
                          variant={form.formType === 'PATIENT' ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {form.formType === 'PATIENT' ? 'Patient' : 'Non-Patient'}
                        </Badge>
                      </div>
                      {form.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {form.description}
                        </p>
                      )}
                      {form.category && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {form.category}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
