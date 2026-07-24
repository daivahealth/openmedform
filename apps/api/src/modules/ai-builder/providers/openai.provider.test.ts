import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiProvider } from './openai.provider';

const create = vi.fn();

vi.mock('openai', () => ({
  default: class OpenAI {
    responses = { create };
  },
}));

describe('OpenAiProvider', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ output_text: '{"ok":true}' });
  });

  it('uses the Responses API with JSON-object output for schema generation', async () => {
    const provider = new OpenAiProvider('test-key', 'gpt-5.6-terra');

    await expect(provider.generate('user prompt', 'system prompt', { jsonMode: true, maxTokens: 123 }))
      .resolves.toBe('{"ok":true}');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-terra',
      instructions: 'system prompt',
      input: 'user prompt',
      max_output_tokens: 123,
      text: { format: { type: 'json_object' } },
    }));
    expect(create.mock.calls[0][0]).not.toHaveProperty('temperature');
  });

  it('sends source pages as high-detail Responses API image inputs', async () => {
    const provider = new OpenAiProvider('test-key', 'gpt-5.6-terra');

    await provider.generateWithImages('inspect this page', [
      { type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' },
    ], 'system prompt', { jsonMode: true });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,aGVsbG8=',
              detail: 'high',
            },
            { type: 'input_text', text: 'inspect this page' },
          ],
        },
      ],
    }));
  });

  it('retains deterministic temperature for models that support sampling controls', async () => {
    const provider = new OpenAiProvider('test-key', 'gpt-4o');

    await provider.generate('user prompt', 'system prompt', { temperature: 0.1 });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.1 }));
  });
});
