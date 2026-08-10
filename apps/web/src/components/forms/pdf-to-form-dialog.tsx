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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateJsonFormsForm, type ConversionJob } from '@/hooks/use-conversions';
import { ConversionProgress } from './conversion-progress';
import { useAiProviders } from '@/hooks/use-ai-builder';
import { AlertCircle, FileUp } from 'lucide-react';
import axios from 'axios';

interface PdfToFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'processing' | 'error';

export function PdfToFormDialog({ open, onOpenChange }: PdfToFormDialogProps) {
  const router = useRouter();
  const createJsonFormsForm = useCreateJsonFormsForm();
  const { data: providerData } = useAiProviders();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState('');
  const [provider, setProvider] = useState('');
  /**
   * Opt in to reading declarative config out of an HTML mock-up's scripts.
   * Off by default and never remembered between uploads: it narrows the
   * strip-scripts posture, so it is a per-file decision.
   */
  const [readScriptConfig, setReadScriptConfig] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  /** Latest polled snapshot of the running job — drives the stage checklist. */
  const [job, setJob] = useState<ConversionJob | null>(null);


  function reset() {
    setStep('upload');
    setJob(null);
    setFile(null);
    setInstructions('');
    setProvider('');
    setReadScriptConfig(false);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose(isOpen: boolean) {
    // The conversion keeps running server-side whatever the dialog does, so
    // dismissing mid-run just hides the only report of it.
    if (!isOpen && step === 'processing') return;
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
    setErrorMsg('');
    setFile(selected);
    // The option only means anything for HTML; drop a stale opt-in rather than
    // carrying it silently onto a different file.
    if (!isHtmlFile(selected)) setReadScriptConfig(false);
  }

  async function handleSubmit() {
    if (!file) return;

    setStep('processing');
    setErrorMsg('');

    try {
      const { formId } = await createJsonFormsForm.mutateAsync({
        file,
        provider: provider || undefined,
        instructions: instructions.trim() || undefined,
        extractScriptConfig: isHtml && readScriptConfig,
        onJobUpdate: setJob,
      });
      handleClose(false);
      router.push(`/forms/${formId}/preview`);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setStep('error');
    }
  }

  const providers = providerData?.providers ?? [];
  const isHtml = isHtmlFile(file);
  const canSubmit = !!file;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg"
        hideClose={step === 'processing'}
        onInteractOutside={(event) => step === 'processing' && event.preventDefault()}
        onEscapeKeyDown={(event) => step === 'processing' && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>New Form from File</DialogTitle>
          <DialogDescription>
            Upload a clinical form PDF, HTML mock-up, or image. The AI generates the
            separate data, layout and print schemas and opens the draft for review.
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
                    <p className="text-sm font-medium">Click to upload</p>
                    <p className="text-xs text-muted-foreground">
                      PDF, HTML, PNG, JPEG, WebP, or GIF. Max 10 MB (HTML 2 MB).
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,application/pdf,text/html,image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              The form name is taken from the file name; you can rename it after review.
            </p>

            <div className="grid gap-2">
              <Label htmlFor="pdf-instructions">
                Extra instructions <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="pdf-instructions"
                placeholder="e.g., Include scoring for risk factors, add signature block at the end..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
              />
            </div>

            {isHtml && (
              <div className="rounded-md border border-input p-3">
                <label
                  htmlFor="pdf-script-config"
                  className="flex cursor-pointer items-start gap-2"
                >
                  <input
                    id="pdf-script-config"
                    type="checkbox"
                    checked={readScriptConfig}
                    onChange={(e) => setReadScriptConfig(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                  />
                  <span className="grid gap-1">
                    <span className="text-sm font-medium leading-none">
                      Read option lists from this mock-up&rsquo;s scripts
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Mock-ups often keep their dropdown options, thresholds and reference
                      tables in JavaScript rather than in the markup. The scripts are{' '}
                      <strong>parsed, never run</strong>, and only plain values are read.
                      Leave this off unless you trust the file &mdash; anything it contains
                      is shown to the AI as data. Everything read is listed for you to check
                      after conversion.
                    </span>
                  </span>
                </label>
              </div>
            )}

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

        {step === 'processing' && <ConversionProgress job={job} />}

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
                Generate Form
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

function isHtmlFile(file: File | null): boolean {
  if (!file) return false;
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
