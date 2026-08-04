/** Token usage a provider reports for a single generation call. */
export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /**
   * Input tokens served from the provider's prompt cache — a subset of
   * inputTokens, billed at a deep discount (Anthropic ~10%) or free-ish
   * (OpenAI 50%). Zero when the provider does not report caching. Recorded so
   * /admin/usage can show real vs effectively-billed input (issue #129).
   */
  cachedInputTokens: number;
}

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /**
   * Best-effort usage sink. Providers invoke this (when the underlying SDK
   * reports usage) so callers can meter token consumption without changing the
   * string return contract. The metering wrapper in AiUsageService injects it;
   * a failure inside it must never break generation.
   */
  onUsage?: (usage: TokenUsage) => void;
}

export interface ImageContent {
  type: 'image';
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
  data: string;
}

export interface LlmProvider {
  readonly name: string;
  generate(prompt: string, systemPrompt: string, options?: LlmOptions): Promise<string>;
  generateWithImages?(prompt: string, images: ImageContent[], systemPrompt: string, options?: LlmOptions): Promise<string>;
}
