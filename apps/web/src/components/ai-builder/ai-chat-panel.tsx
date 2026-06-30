'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAiGenerate,
  useFormAiRefine,
  useAiProviders,
  useAiMessages,
  useAddAiMessage,
  useClearAiMessages,
} from '@/hooks/use-ai-builder';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Bot,
  Send,
  Loader2,
  ChevronRight,
  Sparkles,
  Check,
  X,
  ImagePlus,
  Trash2,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  schema?: Record<string, unknown>;
  provider?: string;
}

interface AiChatPanelProps {
  formId: string;
  currentSchema: Record<string, unknown>;
  onApplySchema: (schema: Record<string, unknown>) => void;
}

export function AiChatPanel({ formId, currentSchema, onApplySchema }: AiChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const initialLoadDone = useRef(false);

  const { data: dbMessages } = useAiMessages(formId);
  const addMessage = useAddAiMessage(formId);
  const clearMessages = useClearAiMessages(formId);
  const { data: providersData } = useAiProviders();
  const generate = useAiGenerate();
  const refine = useFormAiRefine();

  useEffect(() => {
    if (dbMessages && !initialLoadDone.current) {
      setLocalMessages(
        dbMessages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          provider: m.provider ?? undefined,
        })),
      );
      initialLoadDone.current = true;
    }
  }, [dbMessages]);

  const isLoading = generate.isPending || refine.isPending;
  const providers = providersData?.providers ?? [];

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachedImage) || isLoading) return;
    const imageToSend = attachedImage;

    const userContent = imageToSend
      ? `${text || 'Use attached image to correct the form.'}\n\nAttached: ${imageToSend.name}`
      : text;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedImage(null);
    setProgressMessage('');
    scrollToBottom();

    addMessage.mutate({ role: 'user', content: userContent });

    try {
      let result: { schema: Record<string, unknown>; provider: string; changeSummary?: string };

      const hasExistingSchema =
        !!imageToSend ||
        localMessages.some((m) => m.schema) ||
        ((currentSchema as { components?: unknown[] }).components?.length ?? 0) > 0;

      const onProgress = (message: string) => {
        setProgressMessage(message);
        scrollToBottom();
      };

      if (hasExistingSchema) {
        const history = localMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        result = await refine.mutateAsync({
          formId,
          currentSchema,
          instruction: text || 'Use the attached image to correct the current form.',
          conversationHistory: history,
          provider: selectedProvider || undefined,
          image: imageToSend ?? undefined,
          onProgress,
        });
      } else {
        result = await generate.mutateAsync({
          prompt: text,
          provider: selectedProvider || undefined,
        });
      }

      setProgressMessage('');
      const summaryText = result.changeSummary
        ? `Changes made (${result.provider}):\n${result.changeSummary}\n\nClick "Apply" to load into the builder.`
        : `Generated form schema using ${result.provider}. Click "Apply" to load it into the builder.`;
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: summaryText,
        schema: result.schema,
        provider: result.provider,
      };
      setLocalMessages((prev) => [...prev, assistantMsg]);
      scrollToBottom();

      addMessage.mutate({ role: 'assistant', content: summaryText, provider: result.provider });
    } catch (err: any) {
      setProgressMessage('');
      const errorContent = `Error: ${err?.response?.data?.message ?? err?.message ?? 'Failed to generate form'}`;
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
      };
      setLocalMessages((prev) => [...prev, errorMsg]);
      scrollToBottom();

      addMessage.mutate({ role: 'assistant', content: errorContent });
    }
  }, [
    input,
    attachedImage,
    isLoading,
    localMessages,
    currentSchema,
    selectedProvider,
    generate,
    refine,
    addMessage,
    scrollToBottom,
    formId,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isSupportedImage(file)) {
      setAttachedImage(file);
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  }, []);

  const handleClearHistory = useCallback(() => {
    setLocalMessages([]);
    initialLoadDone.current = true;
    clearMessages.mutate();
  }, [clearMessages]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed right-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
        title="Open AI Assistant"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="flex h-full w-[380px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold">AI Form Builder</span>
        </div>
        <div className="flex items-center gap-1">
          {localMessages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearHistory}
              title="Clear chat history"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(true)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Provider selector */}
      {providers.length > 1 && (
        <div className="border-b px-4 py-2">
          <select
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option value="">Default provider</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {localMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Sparkles className="mb-3 h-10 w-10 text-primary/40" />
            <p className="text-sm font-medium">AI Form Builder</p>
            <p className="mt-1 text-xs">
              Describe the form you want to create, ask to modify the current
              form, or attach an image as visual reference.
            </p>
            <div className="mt-4 space-y-2 text-xs">
              <button
                className="block w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
                onClick={() =>
                  setInput('Build a patient intake form with demographics and medical history')
                }
              >
                "Build a patient intake form..."
              </button>
              <button
                className="block w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
                onClick={() =>
                  setInput('Create a falls risk assessment with scoring')
                }
              >
                "Create a falls risk assessment..."
              </button>
              <button
                className="block w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
                onClick={() =>
                  setInput('Build a surgical safety checklist based on WHO guidelines')
                }
              >
                "Build a surgical safety checklist..."
              </button>
            </div>
          </div>
        )}

        {localMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.schema && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs"
                    onClick={() => onApplySchema(msg.schema!)}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Apply to Builder
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{progressMessage || 'Starting...'}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        {attachedImage && (
          <div className="mb-2 flex items-center justify-between rounded-md border bg-muted px-2 py-1 text-xs">
            <span className="truncate">Attached image: {attachedImage.name}</span>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="ml-2 rounded p-1 hover:bg-background"
              aria-label="Remove attached image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            ref={imageInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleImageChange}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => imageInputRef.current?.click()}
            disabled={isLoading}
            title="Attach image reference"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Describe the change or attach an image... (Shift+Enter for new line)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={4}
            className="text-sm resize-none"
          />
          <Button
            size="icon"
            className="shrink-0"
            onClick={handleSend}
            disabled={(!input.trim() && !attachedImage) || isLoading}
          >
            {isLoading ? (
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

function isSupportedImage(file: File): boolean {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type);
}
