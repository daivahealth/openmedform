'use client';

import { useCallback, useRef, useState } from 'react';
import { useAiGenerate, useAiRefine, useAiProviders } from '@/hooks/use-ai-builder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bot,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  X,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  schema?: Record<string, unknown>;
  provider?: string;
}

interface AiChatPanelProps {
  currentSchema: Record<string, unknown>;
  onApplySchema: (schema: Record<string, unknown>) => void;
}

export function AiChatPanel({ currentSchema, onApplySchema }: AiChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: providersData } = useAiProviders();
  const generate = useAiGenerate();
  const refine = useAiRefine();

  const isLoading = generate.isPending || refine.isPending;
  const providers = providersData?.providers ?? [];

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    scrollToBottom();

    try {
      let result: { schema: Record<string, unknown>; provider: string };

      const hasExistingSchema =
        messages.some((m) => m.schema) ||
        ((currentSchema as { components?: unknown[] }).components?.length ?? 0) > 0;

      if (hasExistingSchema) {
        const schemaToRefine =
          [...messages].reverse().find((m) => m.schema)?.schema ?? currentSchema;
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        result = await refine.mutateAsync({
          currentSchema: schemaToRefine,
          instruction: text,
          conversationHistory: history,
          provider: selectedProvider || undefined,
        });
      } else {
        result = await generate.mutateAsync({
          prompt: text,
          provider: selectedProvider || undefined,
        });
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Generated form schema using ${result.provider}. Click "Apply" to load it into the builder.`,
        schema: result.schema,
        provider: result.provider,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      scrollToBottom();
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${err?.response?.data?.message ?? err?.message ?? 'Failed to generate form'}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
      scrollToBottom();
    }
  }, [
    input,
    isLoading,
    messages,
    currentSchema,
    selectedProvider,
    generate,
    refine,
    scrollToBottom,
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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
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
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Sparkles className="mb-3 h-10 w-10 text-primary/40" />
            <p className="text-sm font-medium">AI Form Builder</p>
            <p className="mt-1 text-xs">
              Describe the form you want to create, or ask to modify the
              current form.
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

        {messages.map((msg) => (
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
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating form...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Describe your form..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="text-sm"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
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
