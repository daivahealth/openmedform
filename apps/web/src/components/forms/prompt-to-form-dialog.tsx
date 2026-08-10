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
import {
  useCreateFormFromPromptJob,
  type ConversionJob,
} from '@/hooks/use-conversions';
import { useAiProviders } from '@/hooks/use-ai-builder';
import { CategorySelect } from '@/components/forms/category-select';
import { ConversionProgress, PROMPT_STAGES } from './conversion-progress';
import { cn } from '@/lib/utils';
import { AlertCircle, UserRound, ClipboardList } from 'lucide-react';
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
  const createFromPrompt = useCreateFormFromPromptJob();
  const { data: providerData } = useAiProviders();

  const [step, setStep] = useState<Step>('compose');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('');
  const [formType, setFormType] = useState<'PATIENT' | 'NON_PATIENT'>('PATIENT');
  const [provider, setProvider] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  /** Latest polled snapshot of the running job — drives the stage checklist. */
  const [job, setJob] = useState<ConversionJob | null>(null);

  const busy = step === 'processing';

  function reset() {
    setStep('compose');
    setName('');
    setPrompt('');
    setCategory('');
    setFormType('PATIENT');
    setProvider('');
    setErrorMsg('');
    setJob(null);
  }

  function handleClose(isOpen: boolean) {
    // A click on the backdrop used to close this mid-generation. The work kept
    // running server-side, so the form appeared in the list minutes later with
    // nothing having told the user it was coming — they could not tell a
    // running job from a failed one.
    if (!isOpen && busy) return;
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  async function handleSubmit() {
    if (!name.trim() || !prompt.trim() || !category.trim()) return;
    setStep('processing');
    setErrorMsg('');
    setJob(null);
    try {
      const result = await createFromPrompt.mutateAsync({
        name: name.trim(),
        prompt: prompt.trim(),
        category: category.trim(),
        provider: provider || undefined,
        onJobUpdate: setJob,
      });
      reset();
      onOpenChange(false);
      // /builder does not exist — the drag-and-drop builder route went away
      // with the Form.io engine, so a successful generation landed the user on
      // a 404. Review-and-refine lives on the preview page, which is also
      // where the file dialog and the list's own edit action go.
      router.push(`/forms/${result.formId}/preview`);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setStep('error');
    }
  }

  const providers = providerData?.providers ?? [];
  const canSubmit = !!name.trim() && !!prompt.trim() && !!category.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* While a job is running there is nowhere useful to dismiss to: the work
          continues server-side either way, and closing would leave the user
          with no way to find out how it went. Radix closes on backdrop click
          and Escape by default, so both are refused explicitly. */}
      <DialogContent
        className="sm:max-w-lg"
        hideClose={busy}
        onInteractOutside={(event) => busy && event.preventDefault()}
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
      >
        <DialogHeader>
          {/* Titled exactly like the button that opens it, so there is no
              moment of "is this the thing I clicked?". */}
          <DialogTitle>New Form from Description</DialogTitle>
          <DialogDescription>
            Describe the clinical form you need and the AI drafts it, then opens
            the draft for review.
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

            <CategorySelect id="prompt-form-cat" value={category} onChange={setCategory} />

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
          <ConversionProgress job={job} stages={PROMPT_STAGES} />
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
