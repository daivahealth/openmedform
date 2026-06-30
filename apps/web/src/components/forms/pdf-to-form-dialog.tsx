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
import { useAiProviders } from '@/hooks/use-ai-builder';
import { AlertCircle, FileUp, Loader2 } from 'lucide-react';
import axios from 'axios';

interface PdfToFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'processing' | 'error';

export function PdfToFormDialog({ open, onOpenChange }: PdfToFormDialogProps) {
  const router = useRouter();
  const createFormFromFile = useCreateFormFromFile();
  const { data: providerData } = useAiProviders();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState('');
  const [provider, setProvider] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');

  function reset() {
    setStep('upload');
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
    if (selected && isSupportedSourceFile(selected)) {
      setFile(selected);
      const nameWithoutExt = selected.name.replace(/\.(pdf|png|jpe?g|webp|gif)$/i, '');
      setFormName(
        nameWithoutExt
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      );
    }
  }

  async function handleCreateFromFile() {
    if (!file || !formName.trim()) return;

    setStep('processing');
    setErrorMsg('');

    try {
      const result = await createFormFromFile.mutateAsync({
        file,
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory.trim() || undefined,
        formType: 'PATIENT',
        provider: provider || undefined,
        instructions: instructions.trim() || undefined,
      });

      handleClose(false);
      router.push(`/forms/${result.form.id}/builder`);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setStep('error');
    }
  }

  const providers = providerData?.providers ?? [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Form from PDF or Image</DialogTitle>
          <DialogDescription>
            Upload a clinical form PDF or image. The backend AI agent will
            generate a draft Form.io form and open it in the builder for review.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="grid gap-4 py-4">
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
                    <p className="text-sm font-medium">Click to upload PDF</p>
                    <p className="text-xs text-muted-foreground">
                      PDF, PNG, JPEG, WebP, or GIF. Max 10 MB.
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

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

            <div className="grid gap-2">
              <Label htmlFor="pdf-form-cat">Category</Label>
              <Input
                id="pdf-form-cat"
                placeholder="e.g., Assessment, Checklist, Consent"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              />
            </div>

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
              <p className="font-medium">Creating draft form...</p>
              <p className="text-sm text-muted-foreground">
                Analyzing the source file, generating a Form.io schema,
                validating it, and saving a draft version.
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
              <Button
                onClick={handleCreateFromFile}
                disabled={!file || !formName.trim()}
              >
                Create Draft Form
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

function isSupportedSourceFile(file: File): boolean {
  return [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ].includes(file.type);
}
