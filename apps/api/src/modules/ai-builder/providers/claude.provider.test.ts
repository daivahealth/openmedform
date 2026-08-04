import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeProvider } from './claude.provider';

const create = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create };
  },
}));

describe('ClaudeProvider prompt caching (#129)', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      content: [{ type: 'text', text: '{"ok":true}' }],
      usage: { input_tokens: 7000, output_tokens: 100, cache_read_input_tokens: 6500 },
    });
  });

  it('marks the system prompt as a cacheable block on text generation', async () => {
    const provider = new ClaudeProvider('key', 'claude-sonnet-5');

    await provider.generate('user prompt', 'the big static system prompt');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        system: [
          {
            type: 'text',
            text: 'the big static system prompt',
            cache_control: { type: 'ephemeral' },
          },
        ],
      }),
    );
  });

  it('marks it on image generation too — the vision path is the expensive one', async () => {
    const provider = new ClaudeProvider('key', 'claude-sonnet-5');

    await provider.generateWithImages(
      'inspect',
      [{ type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' }],
      'the big static system prompt',
    );

    const args = create.mock.calls[0][0];
    expect(args.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('reports cache reads through the usage sink', async () => {
    const provider = new ClaudeProvider('key', 'claude-sonnet-5');
    const onUsage = vi.fn();

    await provider.generate('p', 's', { onUsage });

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 7000, cachedInputTokens: 6500 }),
    );
  });
});
