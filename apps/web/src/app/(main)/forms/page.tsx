'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Eye, Archive, Inbox, Copy, Download, Upload, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useForms, useArchiveForm, useCloneForm, useExportForm, useImportForm } from '@/hooks/use-forms';
import { FormStatusBadge } from '@/components/forms/form-status-badge';
import { CreateFormDialog } from '@/components/forms/create-form-dialog';
import { PdfToFormDialog } from '@/components/forms/pdf-to-form-dialog';

export default function FormsPage() {
  const router = useRouter();
  const { data: forms, isLoading } = useForms();
  const archiveForm = useArchiveForm();
  const cloneForm = useCloneForm();
  const exportForm = useExportForm();
  const importForm = useImportForm();
  const [createOpen, setCreateOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      const template = JSON.parse(text);
      await importForm.mutateAsync(template);
    } catch {
      alert('Invalid template file');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" onClick={handleImportClick} disabled={importForm.isPending}>
            <Upload className="mr-2 h-4 w-4" />
            {importForm.isPending ? 'Importing...' : 'Import'}
          </Button>
          <Button variant="outline" onClick={() => setPdfOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            From File
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
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
                    <td className="px-4 py-8" colSpan={6}>
                      <div className="flex justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      </div>
                    </td>
                  </tr>
                ) : !forms?.length ? (
                  <tr className="border-b">
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                        <p>No forms yet</p>
                        <p className="text-sm">
                          Create your first form to get started
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  forms.map((form) => (
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
                            onClick={() =>
                              router.push(`/forms/${form.id}/builder`)
                            }
                            title="Edit"
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
                            onClick={() =>
                              router.push(`/forms/${form.id}/submissions`)
                            }
                            title="Responses"
                          >
                            <Inbox className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => cloneForm.mutate(form.id)}
                            title="Clone"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {form.status === 'PUBLISHED' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleExport(form.id, form.name)}
                              title="Export Template"
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CreateFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PdfToFormDialog open={pdfOpen} onOpenChange={setPdfOpen} />
    </div>
  );
}
