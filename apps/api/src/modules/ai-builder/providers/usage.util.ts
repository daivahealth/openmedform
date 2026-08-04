import { LlmOptions, TokenUsage } from './llm-provider.interface';

/**
 * Normalises the various SDK usage shapes into TokenUsage and fires the
 * caller's onUsage sink. Best-effort: missing/partial usage yields zeros and a
 * throwing sink is swallowed so it can never break a successful generation.
 */
export function emitUsage(
  options: LlmOptions | undefined,
  model: string,
  usage:
    | {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        cache_read_input_tokens?: number | null;
      }
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number } | null;
        input_tokens_details?: { cached_tokens?: number } | null;
      }
    | null
    | undefined,
): void {
  if (!options?.onUsage) return;

  const u = (usage ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  const inputTokens = num(u.input_tokens) || num(u.prompt_tokens);
  const outputTokens = num(u.output_tokens) || num(u.completion_tokens);
  const totalTokens = num(u.total_tokens) || inputTokens + outputTokens;
  // Anthropic reports cache READS as a sibling of input_tokens
  // (cache_read_input_tokens); OpenAI nests cached_tokens under
  // prompt_tokens_details (Chat Completions) or input_tokens_details
  // (Responses API). Whichever exists wins; absent means uncached.
  const details = (u.prompt_tokens_details ?? u.input_tokens_details ?? {}) as Record<
    string,
    unknown
  >;
  const cachedInputTokens = num(u.cache_read_input_tokens) || num(details.cached_tokens);

  const normalised: TokenUsage = {
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
  };
  try {
    options.onUsage(normalised);
  } catch {
    // A metering sink must never fail the generation it is measuring.
  }
}
