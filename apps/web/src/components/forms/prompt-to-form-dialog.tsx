'use client';

import { useState } from 'react';
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
import { useCreateFormFromPrompt } from '@/hooks/use-forms';
import { useAiProviders } from '@/hooks/use-ai-builder';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2, UserRound, ClipboardList } from 'lucide-react';
import axios from 'axios';

interface PromptToFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'compose' | 'processing' | 'error';

const EXAMPLE_PROMPT =
  'Build a pre-anaesthesia checkup form with patient history, airway assessment, ASA grade, and a sign-off section.';

export function PromptToFormDialog({ open, onOpenChange }: PromptToFormDialogProps) {
  const router = useRouter();
  const createFromPrompt = useCreateFormFromPrompt();
  const { data: providerData } = useAiProviders();

  const [step, setStep] = useState<Step>('compose');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('');
  const [formType, setFormType] = useState<'PATIENT' | 'NON_PATIENT'>('PATIENT');
  const [provider, setProvider] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  function reset() {
    setStep('compose');
    setName('');
    setPrompt('');
    setCategory('');
    setFormType('PATIENT');
    setProvider('');
    setErrorMsg('');
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  async function handleSubmit() {
    if (!name.trim() || !prompt.trim()) return;
    setStep('processing');
    setErrorMsg('');
    try {
      const result = await createFromPrompt.mutateAsync({
        name: name.trim(),
        prompt: prompt.trim(),
        category: category.trim() || undefined,
        formType,
        provider: provider || undefined,
      });
      handleClose(false);
      router.push(`/forms/${result.form.id}/builder`);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setStep('error');
    }
  }

  const providers = providerData?.providers ?? [];
  const canSubmit = !!name.trim() && !!prompt.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Form from a Prompt</DialogTitle>
          <DialogDescription>
            Describe the clinical form you need and the AI generates a draft,
            then opens it in the drag-and-drop builder.
          </DialogDescription>
        </DialogHeader>

        {step === 'compose' && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Form Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormType('PATIENT')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors',
                    formType === 'PATIENT'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30',
                  )}
                >
                  <UserRound className={cn('h-6 w-6', formType === 'PATIENT' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">Patient Form</span>
                  <span className="text-xs text-muted-foreground">Tied to a patient encounter</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('NON_PATIENT')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors',
                    formType === 'NON_PATIENT'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30',
                  )}
                >
                  <ClipboardList className={cn('h-6 w-6', formType === 'NON_PATIENT' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">Non-Patient Form</span>
                  <span className="text-xs text-muted-foreground">OT checklist, audit, etc.</span>
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="prompt-form-name">Name *</Label>
              <Input
                id="prompt-form-name"
                placeholder="e.g., Pre-Anaesthesia Checkup"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="prompt-text">Describe the form *</Label>
              <Textarea
                id="prompt-text"
                placeholder={EXAMPLE_PROMPT}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Mention the sections, fields, and any scoring you want. You can refine it in the builder afterwards.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="prompt-form-cat">Category</Label>
              <Input
                id="prompt-form-cat"
                placeholder="e.g., Assessment, Checklist, Consent"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            {providers.length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="prompt-provider">AI Provider</Label>
                <select
                  id="prompt-provider"
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
              <p className="font-medium">Generating your form…</p>
              <p className="text-sm text-muted-foreground">
                Building a Form.io schema from your prompt, validating it, and saving a draft. This can take up to a minute.
              </p>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Could not generate the form</p>
                <p className="mt-1">{errorMsg}</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'compose' && (
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
              <Button onClick={() => setStep('compose')}>Try Again</Button>
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
  return error instanceof Error ? error.message : 'Failed to generate the form';
}
