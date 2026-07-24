'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDeleteForm, useFormDeletionSummary } from '@/hooks/use-forms';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteFormTarget {
  id: string;
  name: string;
}

interface DeleteFormDialogProps {
  form: DeleteFormTarget | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteFormDialog({ form, onOpenChange }: DeleteFormDialogProps) {
  const { data: summary, isLoading } = useFormDeletionSummary(form?.id ?? null);
  const deleteForm = useDeleteForm();

  async function handleDelete() {
    if (!form) return;
    await deleteForm.mutateAsync(form.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={!!form} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete form permanently?
          </DialogTitle>
          <DialogDescription>
            This permanently removes{' '}
            <span className="font-medium text-foreground">{form?.name}</span>{' '}
            from the database. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking what will be
              deleted…
            </span>
          ) : (
            <>
              The following will be permanently destroyed:
              <ul className="mt-2 list-disc pl-5">
                <li>The form and its settings</li>
                <li>
                  {summary?.versionCount ?? 0} form version
                  {summary?.versionCount === 1 ? '' : 's'} (including draft
                  schemas)
                </li>
                <li className={summary && summary.submissionCount > 0 ? 'font-semibold' : ''}>
                  {summary?.submissionCount ?? 0} submitted clinical record
                  {summary?.submissionCount === 1 ? '' : 's'}
                </li>
                <li>All AI chat history for this form</li>
              </ul>
            </>
          )}
        </div>

        {deleteForm.isError && (
          <p className="text-sm text-red-600">
            Failed to delete the form. Please try again.
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteForm.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading || deleteForm.isPending}
          >
            {deleteForm.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…
              </>
            ) : (
              'Delete everything'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
