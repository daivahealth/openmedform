import { describe, expect, it, vi } from 'vitest';
import { emitUsage } from './usage.util';

describe('emitUsage cache reporting (#129)', () => {
  const capture = () => {
    const onUsage = vi.fn();
    return { onUsage, options: { onUsage } };
  };

  it('reads Anthropic cache_read_input_tokens', () => {
    const { onUsage, options } = capture();
    emitUsage(options, 'claude-sonnet-5', {
      input_tokens: 7000,
      output_tokens: 50,
      cache_read_input_tokens: 6500,
    });
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 7000, cachedInputTokens: 6500 }),
    );
  });

  it('reads OpenAI Responses input_tokens_details.cached_tokens', () => {
    const { onUsage, options } = capture();
    emitUsage(options, 'gpt-5.6-terra', {
      input_tokens: 8000,
      output_tokens: 60,
      input_tokens_details: { cached_tokens: 6400 },
    });
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 8000, cachedInputTokens: 6400 }),
    );
  });

  it('reads OpenAI Chat Completions prompt_tokens_details.cached_tokens', () => {
    const { onUsage, options } = capture();
    emitUsage(options, 'kimi-k2', {
      prompt_tokens: 5000,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 4096 },
    });
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 5000, cachedInputTokens: 4096 }),
    );
  });

  it('defaults to zero cached when the provider reports nothing', () => {
    const { onUsage, options } = capture();
    emitUsage(options, 'ollama', { input_tokens: 100, output_tokens: 10 });
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ cachedInputTokens: 0 }));
  });
});
