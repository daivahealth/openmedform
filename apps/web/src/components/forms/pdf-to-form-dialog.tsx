'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateFormFromFile } from '@/hooks/use-forms';
import { useCreateJsonFormsForm } from '@/hooks/use-conversions';
import { useAiProviders } from '@/hooks/use-ai-builder';
import { CategorySelect } from '@/components/forms/category-select';
import { AlertCircle, FileUp, Loader2 } from 'lucide-react';
import axios from 'axios';

interface PdfToFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'processing' | 'error';
type Engine = 'jsonforms' | 'formio';

export function PdfToFormDialog({ open, onOpenChange }: PdfToFormDialogProps) {
  const router = useRouter();
  const createFormFromFile = useCreateFormFromFile();
  const createJsonFormsForm = useCreateJsonFormsForm();
  const { data: providerData } = useAiProviders();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [engine, setEngine] = useState<Engine>('jsonforms');
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState('');
  const [provider, setProvider] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');

  function reset() {
    setStep('upload');
    setEngine('jsonforms');
    setFile(null);
    setInstructions('');
    setProvider('');
    setErrorMsg('');
    setFormName('');
    setFormDescription('');
    setFormCategory('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!isSupportedSourceFile(selected)) {
      setErrorMsg('Unsupported file. Upload a PDF, HTML mock-up, or image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    // HTML converts only to JSON Forms; the Form.io path takes PDFs/images.
    if (isHtmlFile(selected) && engine !== 'jsonforms') {
      setErrorMsg('HTML mock-ups can only be converted with the JSON Forms engine.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setErrorMsg('');
    setFile(selected);
    const nameWithoutExt = selected.name.replace(/\.(pdf|html?|png|jpe?g|webp|gif)$/i, '');
    setFormName(
      nameWithoutExt.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    );
  }

  async function handleSubmit() {
    if (!file) return;
    if (engine === 'formio' && (!formName.trim() || !formCategory.trim())) return;

    setStep('processing');
    setErrorMsg('');

    try {
      if (engine === 'jsonforms') {
        const { formId } = await createJsonFormsForm.mutateAsync({
          file,
          provider: provider || undefined,
          instructions: instructions.trim() || undefined,
        });
        handleClose(false);
        router.push(`/forms/${formId}/preview`);
      } else {
        const result = await createFormFromFile.mutateAsync({
          file,
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          category: formCategory.trim(),
          formType: 'PATIENT',
          provider: provider || undefined,
          instructions: instructions.trim() || undefined,
        });
        handleClose(false);
        router.push(`/forms/${result.form.id}/builder`);
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setStep('error');
    }
  }

  const providers = providerData?.providers ?? [];
  const canSubmit =
    !!file &&
    (engine === 'jsonforms' || (!!formName.trim() && !!formCategory.trim()));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Form from a File</DialogTitle>
          <DialogDescription>
            {engine === 'jsonforms'
              ? 'Upload a clinical form PDF, HTML mock-up, or image. The AI generates a JSON Forms definition (separate data, layout and print schemas) and opens it for review.'
              : 'Upload a clinical form PDF or image. The AI generates a draft Form.io form and opens it in the drag-and-drop builder.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Engine</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEngine('jsonforms')}
                  className={`rounded-md border p-3 text-left text-sm transition-colors ${
                    engine === 'jsonforms'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <span className="font-medium">JSON Forms</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Separate data / layout / print. Recommended for complex forms.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setEngine('formio')}
                  className={`rounded-md border p-3 text-left text-sm transition-colors ${
                    engine === 'formio'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <span className="font-medium">Form.io</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Coupled schema with drag-and-drop builder.
                  </span>
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Source File *</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                <FileUp className="h-8 w-8 text-muted-foreground" />
                {file ? (
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium">Click to upload</p>
                    <p className="text-xs text-muted-foreground">
                      {engine === 'jsonforms'
                        ? 'PDF, HTML, PNG, JPEG, WebP, or GIF. Max 10 MB (HTML 2 MB).'
                        : 'PDF, PNG, JPEG, WebP, or GIF. Max 10 MB.'}
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  engine === 'jsonforms'
                    ? '.pdf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,application/pdf,text/html,image/png,image/jpeg,image/webp,image/gif'
                    : '.pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/png,image/jpeg,image/webp,image/gif'
                }
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {engine === 'formio' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pdf-form-name">Form Name *</Label>
                  <Input
                    id="pdf-form-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., VTE Risk Assessment"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="pdf-form-desc">Description</Label>
                  <Input
                    id="pdf-form-desc"
                    placeholder="Brief description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>

                <CategorySelect id="pdf-form-cat" value={formCategory} onChange={setFormCategory} />
              </>
            )}

            {engine === 'jsonforms' && (
              <p className="text-xs text-muted-foreground">
                The form name is taken from the file name; you can rename it after review.
              </p>
            )}

            <div className="grid gap-2">
              <Label htmlFor="pdf-instructions">Agent Instructions</Label>
              <Textarea
                id="pdf-instructions"
                placeholder="e.g., Include scoring for risk factors, add signature block at the end..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
              />
            </div>

            {providers.length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="pdf-provider">AI Provider</Label>
                <select
                  id="pdf-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Default</option>
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">
                {engine === 'jsonforms'
                  ? 'Converting to JSON Forms…'
                  : 'Creating draft form…'}
              </p>
              <p className="text-sm text-muted-foreground">
                {engine === 'jsonforms'
                  ? 'Analyzing the source file and generating the data, layout and print schemas. This can take up to a couple of minutes.'
                  : 'Analyzing the source file, generating a Form.io schema, validating it, and saving a draft version.'}
              </p>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Failed to process source file</p>
                <p className="mt-1">{errorMsg}</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {engine === 'jsonforms' ? 'Convert to JSON Forms' : 'Create Draft Form'}
              </Button>
            </>
          )}
          {step === 'error' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep('upload')}>Try Again</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }

  return error instanceof Error ? error.message : 'Failed to process source file';
}

function isHtmlFile(file: File): boolean {
  // Some browsers report an empty type for .html; fall back to the extension.
  return file.type === 'text/html' || /\.html?$/i.test(file.name);
}

function isSupportedSourceFile(file: File): boolean {
  return (
    [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'text/html',
    ].includes(file.type) || isHtmlFile(file)
  );
}
