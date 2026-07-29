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
    | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | null
    | undefined,
): void {
  if (!options?.onUsage) return;

  const u = (usage ?? {}) as Record<string, number | undefined>;
  const inputTokens = u.input_tokens ?? u.prompt_tokens ?? 0;
  const outputTokens = u.output_tokens ?? u.completion_tokens ?? 0;
  const totalTokens = u.total_tokens ?? inputTokens + outputTokens;

  const normalised: TokenUsage = { model, inputTokens, outputTokens, totalTokens };
  try {
    options.onUsage(normalised);
  } catch {
    // A metering sink must never fail the generation it is measuring.
  }
}
