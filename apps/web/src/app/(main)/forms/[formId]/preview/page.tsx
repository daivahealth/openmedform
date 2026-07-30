'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, usePublishForm } from '@/hooks/use-forms';
import { useJsonFormsRefine } from '@/hooks/use-ai-builder';
import { DualFormRenderer, formEngine } from '@/components/forms/dual-form-renderer';
import { AssetsDialog } from '@/components/forms/assets-dialog';
import { PrintPreviewButton } from '@/components/forms/print-preview-button';
import { FormStatusBadge } from '@/components/forms/form-status-badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, CheckCircle2, ImagePlus, Images, Loader2, Pencil, Send, Sparkles, X } from 'lucide-react';

export default function FormPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.formId as string;
  const [refineOpen, setRefineOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [progress, setProgress] = useState('');
  const [refineError, setRefineError] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: form, isLoading } = useForm(formId);
  const refine = useJsonFormsRefine();
  const publish = usePublishForm(formId);
  const [savedNote, setSavedNote] = useState('');
  const [publishError, setPublishError] = useState('');

  async function handlePublish() {
    setPublishError('');
    try {
      await publish.mutateAsync();
      setSavedNote('Published');
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Failed to publish');
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Form not found</p>
      </div>
    );
  }

  const engine = formEngine(form as never);
  const isJsonForms = engine === 'JSONFORMS';

  const version = form.currentVersion ?? form.versions?.[0];
  const hasContent = isJsonForms
    ? !!(version as { dataSchema?: unknown } | undefined)?.dataSchema
    : (() => {
        const schema =
          form.currentVersion?.schema ??
          form.versions?.[0]?.schema ??
          { display: 'form', components: [] };
        const components = (schema as { components?: unknown[] }).components;
        return !!components && components.length > 0;
      })();

  async function handleRefine() {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction && !referenceImage) return;

    setRefineError('');
    setProgress('Preparing refinement...');
    try {
      await refine.mutateAsync({
        formId,
        instruction: trimmedInstruction || 'Use the attached image as visual reference for this form refinement.',
        image: referenceImage ?? undefined,
        onProgress: setProgress,
      });
      setInstruction('');
      setReferenceImage(null);
      setProgress('');
      setRefineOpen(false);
      setSavedNote('All changes saved');
    } catch (error) {
      setProgress('');
      setRefineError(error instanceof Error ? error.message : 'Failed to refine form');
    }
  }

  function selectReferenceImage(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setRefineError('Attach a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    setRefineError('');
    setReferenceImage(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/forms')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Preview: {form.name}
              </h1>
              <FormStatusBadge status={form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'} />
              <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {isJsonForms ? 'JSON Forms' : 'Form.io'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {form.description || 'Preview how the form will appear to users'}
            </p>
          </div>
        </div>

        {/* The drag-and-drop builder is Form.io-only; JSON Forms forms are
            edited via the prompt-based designer, not this builder. */}
        {isJsonForms ? (
          <div className="flex items-center gap-3">
            {savedNote && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {savedNote}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setAssetsOpen(true)}>
              <Images className="mr-2 h-4 w-4" />
              Assets
            </Button>
            <PrintPreviewButton form={form as never} />
            <Button variant="outline" size="sm" onClick={() => setRefineOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Refine with AI
            </Button>
            {form.status !== 'PUBLISHED' && (
              <Button size="sm" onClick={() => void handlePublish()} disabled={publish.isPending}>
                {publish.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Publish
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setAssetsOpen(true)}>
              <Images className="mr-2 h-4 w-4" />
              Assets
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/forms/${formId}/builder`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit in Builder
            </Button>
          </div>
        )}
      </div>

      <AssetsDialog formId={formId} open={assetsOpen} onOpenChange={setAssetsOpen} />

      {isJsonForms && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Edits made with “Refine with AI” are saved automatically. Publish to make this
            version available for data entry.
          </span>
          {publishError && <span className="text-destructive">{publishError}</span>}
        </div>
      )}

      <Dialog open={refineOpen} onOpenChange={(open) => !refine.isPending && setRefineOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refine with AI</DialogTitle>
            <DialogDescription>
              Describe the layout or content change. Existing fields, labels, and validation are preserved unless you explicitly ask to change them.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="For example: Match the source document layout. Use columns only where sections are visibly side by side; keep wide grids full-width."
            disabled={refine.isPending}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              selectReferenceImage(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => imageInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') imageInputRef.current?.click();
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectReferenceImage(event.dataTransfer.files[0]);
            }}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:bg-muted/50"
          >
            <ImagePlus className="h-4 w-4" />
            Drag an image here or click to attach a visual reference
          </div>
          {referenceImage && (
            <div className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-sm">
              <span className="truncate">Attached: {referenceImage.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setReferenceImage(null)}
                aria-label="Remove attached image"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
          {refineError && <p className="text-sm text-destructive">{refineError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefineOpen(false)} disabled={refine.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleRefine()}
              disabled={(!instruction.trim() && !referenceImage) || refine.isPending}
            >
              {refine.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {refine.isPending ? 'Refining…' : 'Refine form'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border bg-white p-6">
        {hasContent ? (
          <DualFormRenderer form={form as never} readOnly />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <p>This form has no content yet</p>
            {!isJsonForms && (
              <>
                <p className="text-sm">Open the builder to add fields and layouts</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => router.push(`/forms/${formId}/builder`)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Open Builder
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
