'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AxiosError } from 'axios';
import { Plus, Pencil, Eye, Archive, Copy, Download, FileUp } from 'lucide-react';
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
  useCloneForm,
  useExportForm,
} from '@/hooks/use-forms';
import { FormStatusBadge } from '@/components/forms/form-status-badge';
import { PromptToFormDialog } from '@/components/forms/prompt-to-form-dialog';
import { PdfToFormDialog } from '@/components/forms/pdf-to-form-dialog';

export default function FormsPage() {
  const router = useRouter();
  const { data: forms, isLoading, isError, error, refetch } = useForms();
  const archiveForm = useArchiveForm();
  const cloneForm = useCloneForm();
  const exportForm = useExportForm();
  const [promptOpen, setPromptOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forms</h1>
          <p className="text-muted-foreground">
            Create and manage clinical forms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPdfOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            From File
          </Button>
          <Button onClick={() => setPromptOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Form
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Forms</CardTitle>
          <CardDescription>
            A list of all forms in your workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
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
                    <td className="px-4 py-8" colSpan={7}>
                      <div className="flex justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      </div>
                    </td>
                  </tr>
                ) : isError ? (
                  <tr className="border-b">
                    <td className="px-4 py-3" colSpan={7}>
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
                    <td className="px-4 py-3" colSpan={7}>
                      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                        <p>No forms yet</p>
                        <p className="text-sm">
                          Create your first form to get started
                        </p>
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
                          {form.status !== 'ARCHIVED' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => archiveForm.mutate(form.id)}
                              title="Archive"
                            >
                              <Archive className="h-4 w-4" />
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
      <PdfToFormDialog open={pdfOpen} onOpenChange={setPdfOpen} />
    </div>
  );
}
