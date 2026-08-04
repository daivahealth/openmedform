'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, usePublishForm } from '@/hooks/use-forms';
import { JsonFormsRendererWrapper } from '@/components/forms/jsonforms-renderer-wrapper';
import { AssetsDialog } from '@/components/forms/assets-dialog';
import { RefineChatPanel } from '@/components/forms/refine-chat-panel';
import { PrintPreviewButton } from '@/components/forms/print-preview-button';
import { FormStatusBadge } from '@/components/forms/form-status-badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Images, Loader2, PanelRightClose, Send, Sparkles } from 'lucide-react';

export default function FormPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.formId as string;
  // Open by default: refining is this screen's main activity, and the chat is
  // beside the preview rather than over it, so it costs nothing to show.
  const [refineOpen, setRefineOpen] = useState(true);
  const [assetsOpen, setAssetsOpen] = useState(false);

  const { data: form, isLoading } = useForm(formId);
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

  const version = form.currentVersion ?? form.versions?.[0];
  const hasContent = !!(version as { dataSchema?: unknown } | undefined)?.dataSchema;

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
            </div>
            <p className="text-sm text-muted-foreground">
              {form.description || 'Preview how the form will appear to users'}
            </p>
          </div>
        </div>

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
          <Button variant="outline" size="sm" onClick={() => setRefineOpen((open) => !open)}>
            {refineOpen ? (
              <PanelRightClose className="mr-2 h-4 w-4" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {refineOpen ? 'Hide chat' : 'Refine with AI'}
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
      </div>

      <AssetsDialog formId={formId} open={assetsOpen} onOpenChange={setAssetsOpen} />

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Edits made with “Refine with AI” are saved automatically. Publish to make this
          version available for data entry.
        </span>
        {publishError && <span className="text-destructive">{publishError}</span>}
      </div>

      <div className={refineOpen ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]' : ''}>
        <div className="min-w-0 rounded-lg border bg-white p-6">
          {hasContent ? (
            <JsonFormsRendererWrapper form={form as never} readOnly />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <p>This form has no content yet</p>
              <p className="text-sm">Use the chat to describe the fields you need</p>
            </div>
          )}
        </div>

        {refineOpen && (
          <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
            <RefineChatPanel formId={formId} onApplied={() => setSavedNote('All changes saved')} />
          </div>
        )}
      </div>
    </div>
  );
}
