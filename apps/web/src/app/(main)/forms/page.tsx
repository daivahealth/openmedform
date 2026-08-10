'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AxiosError } from 'axios';
import {
  Sparkles,
  Pencil,
  Eye,
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  FileUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useForms,
  useArchiveForm,
  useUnarchiveForm,
  useCloneForm,
  useExportForm,
} from '@/hooks/use-forms';
import { FormStatusBadge } from '@/components/forms/form-status-badge';
import { PromptToFormDialog } from '@/components/forms/prompt-to-form-dialog';
import { PdfToFormDialog } from '@/components/forms/pdf-to-form-dialog';

export default function FormsPage() {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const { data: forms, isLoading, isError, error, refetch } = useForms(showArchived);
  const archiveForm = useArchiveForm();
  const unarchiveForm = useUnarchiveForm();
  const cloneForm = useCloneForm();
  const exportForm = useExportForm();
  const [promptOpen, setPromptOpen] = useState(false);
  // Named for what it accepts, not for one of the formats: the dialog also
  // takes HTML mock-ups and images.
  const [fileOpen, setFileOpen] = useState(false);

  async function handleExport(formId: string, formName: string) {
    const template = await exportForm.mutateAsync(formId);
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formName.toLowerCase().replace(/\s+/g, '-')}-template.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forms</h1>
          <p className="text-muted-foreground">
            Create and manage clinical forms
          </p>
        </div>
        {/*
          There are exactly two ways to create a form, and both say so. The
          previous pair — a primary "New Form" next to a secondary "From File" —
          read as one real action plus a variant, when they are peers. Worse,
          "New Form" opened the describe-it dialog, so the button that looked
          like the ordinary way to make a form was in fact the AI one.

          Uploading is primary because it is both the more common start (the
          form usually already exists on paper) and the more faithful result:
          the model reproduces a document rather than inventing one.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setFileOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            New Form from File
          </Button>
          <Button variant="outline" onClick={() => setPromptOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            New Form from Description
          </Button>
        </div>
      </div>

      <Card>
        {/* The filter belongs to this list, so it sits on the list, not up in
            the page header where it competed with the create actions. */}
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>All Forms</CardTitle>
            <CardDescription>
              A list of all forms in your workspace
            </CardDescription>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Show archived
          </label>
        </CardHeader>
        <CardContent>
          {/* Six columns do not fit a phone. Scroll the table inside its own
              box rather than letting it push the whole page sideways. */}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Modified</th>
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
                ) : isError ? (
                  <tr className="border-b">
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">Unable to load forms</p>
                          <p className="text-sm">
                            {(error as AxiosError<{ message?: string }>).response?.data?.message ??
                              'Check that the API is running and that your session is still valid.'}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => void refetch()}>
                          Try again
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : !forms?.length ? (
                  <tr className="border-b">
                    <td className="px-4 py-3" colSpan={6}>
                      {/* The empty state used to say "create your first form"
                          without offering either way to do it, leaving the
                          answer only in the page header. This is where someone
                          with no forms is actually looking. */}
                      <div className="flex flex-col items-center gap-6 py-10 text-center">
                        <div>
                          <p className="font-medium text-foreground">
                            {showArchived ? 'No forms here yet' : 'No forms yet'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Start from a form you already have, or describe one
                            from scratch.
                          </p>
                        </div>
                        <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                          <CreateOptionCard
                            icon={FileUp}
                            title="Start from a file"
                            hint="Most accurate"
                            description="Upload a PDF, HTML mock-up or photo of an existing form. Its sections, fields and scoring are reproduced."
                            onClick={() => setFileOpen(true)}
                          />
                          <CreateOptionCard
                            icon={Sparkles}
                            title="Start from a description"
                            description="Describe the form in your own words and get a first draft. Best when nothing exists to upload."
                            onClick={() => setPromptOpen(true)}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  forms.map((form) => {
                    return (
                    <tr key={form.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{form.name}</p>
                          {form.description && (
                            <p className="text-xs text-muted-foreground">
                              {form.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={form.formType === 'PATIENT' ? 'default' : 'secondary'}>
                          {form.formType === 'PATIENT' ? 'Patient' : 'Non-Patient'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {form.category || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <FormStatusBadge status={form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(form.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/forms/${form.id}/preview`)}
                            title="Edit with AI"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              router.push(`/forms/${form.id}/preview`)
                            }
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => cloneForm.mutate(form.id)}
                            title="Clone"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {form.status !== 'ARCHIVED' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleExport(form.id, form.name)}
                              title="Download form definition"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {form.status !== 'ARCHIVED' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => archiveForm.mutate(form.id)}
                              title="Archive"
                              aria-label={`Archive ${form.name}`}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => unarchiveForm.mutate(form.id)}
                              disabled={unarchiveForm.isPending}
                              title="Restore this form to the status it had when archived"
                              aria-label={`Unarchive ${form.name}`}
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PromptToFormDialog open={promptOpen} onOpenChange={setPromptOpen} />
      <PdfToFormDialog open={fileOpen} onOpenChange={setFileOpen} />
    </div>
  );
}

/**
 * One of the two ways to create a form, offered side by side in the empty
 * state so the choice is made once, with both options described rather than
 * inferred from a button label.
 */
function CreateOptionCard({
  icon: Icon,
  title,
  hint,
  description,
  onClick,
}: {
  icon: typeof FileUp;
  title: string;
  hint?: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full flex-col gap-2 rounded-lg border-2 p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <span className="font-medium text-foreground">{title}</span>
        {hint && (
          <Badge variant="secondary" className="ml-auto shrink-0 font-normal">
            {hint}
          </Badge>
        )}
      </div>
      <span className="text-sm font-normal text-muted-foreground">
        {description}
      </span>
    </button>
  );
}
