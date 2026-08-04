'use client';

/**
 * The Refine with AI chat panel — lives BESIDE the preview, never over it.
 *
 * This replaced a modal dialog: refining is an iterative look-adjust-look loop,
 * and a modal blocked the very preview being adjusted. The conversation is
 * persistent (form_ai_message), so the panel shows the full history of what
 * was asked of the AI and what came of it — including failures — across
 * sessions and users.
 */

import { useEffect, useRef, useState } from 'react';
import { useFormAiMessages, useJsonFormsRefine, type FormAiMessage } from '@/hooks/use-ai-builder';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, ImagePlus, Loader2, Send, Sparkles, X } from 'lucide-react';

interface RefineChatPanelProps {
  formId: string;
  onApplied?: () => void;
}

function MessageBubble({ message }: { message: FormAiMessage }) {
  const isUser = message.role === 'USER';
  const isError = message.status === 'ERROR';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ' +
          (isUser
            ? 'bg-primary text-primary-foreground'
            : isError
              ? 'border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
              : 'bg-muted text-foreground')
        }
      >
        {isError && (
          <span className="mb-1 flex items-center gap-1 text-xs font-medium">
            <AlertCircle className="h-3 w-3" /> Failed
          </span>
        )}
        {message.content}
        {message.hadImage && (
          <span className="mt-1 block text-xs opacity-75">📎 image attached</span>
        )}
      </div>
    </div>
  );
}

export function RefineChatPanel({ formId, onApplied }: RefineChatPanelProps) {
  const { data: messages, isLoading } = useFormAiMessages(formId);
  const refine = useJsonFormsRefine();

  const [instruction, setInstruction] = useState('');
  const [progress, setProgress] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [attachError, setAttachError] = useState('');
  /** The in-flight instruction, echoed instantly while the server works. */
  const [pending, setPending] = useState<{ content: string; hadImage: boolean } | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view — on load, on new history, on echo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending, progress]);

  function selectReferenceImage(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setAttachError('Attach a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    setAttachError('');
    setReferenceImage(file);
  }

  async function handleSend() {
    const trimmed = instruction.trim();
    if ((!trimmed && !referenceImage) || refine.isPending) return;

    const content =
      trimmed || 'Use the attached image as visual reference for this form refinement.';
    setPending({ content, hadImage: !!referenceImage });
    setInstruction('');
    setAttachError('');
    setProgress('Preparing refinement…');
    try {
      await refine.mutateAsync({
        formId,
        instruction: content,
        image: referenceImage ?? undefined,
        onProgress: setProgress,
      });
      onApplied?.();
    } catch {
      // The failure lands in the transcript as an ERROR bubble via onSettled's
      // history refresh — no separate error banner to fall out of sync with it.
    } finally {
      setPending(null);
      setProgress('');
      setReferenceImage(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-medium leading-none">Refine with AI</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Changes save to the draft automatically
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (messages?.length ?? 0) === 0 && !pending ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>Describe a change to get started.</p>
            <p className="mt-1 text-xs">
              For example: “Make the Morse Fall Score fields dropdowns” or “Add a signature block
              at the end”. Existing fields and validation are preserved unless you ask.
            </p>
          </div>
        ) : (
          messages?.map((message) => <MessageBubble key={message.id} message={message} />)
        )}

        {pending && (
          <MessageBubble
            message={{
              id: 'pending',
              role: 'USER',
              content: pending.content,
              status: 'OK',
              hadImage: pending.hadImage,
              createdAt: '',
            }}
          />
        )}
        {refine.isPending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress || 'Working…'}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        {referenceImage && (
          <div className="flex items-center justify-between rounded-md border bg-muted px-2 py-1.5 text-xs">
            <span className="truncate">📎 {referenceImage.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setReferenceImage(null)}
              aria-label="Remove attached image"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {attachError && <p className="text-xs text-destructive">{attachError}</p>}
        <div className="flex items-end gap-2">
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => imageInputRef.current?.click()}
            disabled={refine.isPending}
            aria-label="Attach a reference image"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Describe a change… (Enter to send, Shift+Enter for a new line)"
            disabled={refine.isPending}
            rows={2}
            className="min-h-0 resize-none"
          />
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => void handleSend()}
            disabled={(!instruction.trim() && !referenceImage) || refine.isPending}
            aria-label="Send"
          >
            {refine.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
