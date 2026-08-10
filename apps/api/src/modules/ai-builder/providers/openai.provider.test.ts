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
      max_output_tokens: 123,
      text: { format: { type: 'json_object' } },
    }));
    expect(create.mock.calls[0][0]).not.toHaveProperty('temperature');
  });

  it('sends source pages as high-detail Responses API image inputs', async () => {
    const provider = new OpenAiProvider('test-key', 'gpt-5.6-terra');

    await provider.generateWithImages('inspect this page for json', [
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
            { type: 'input_text', text: 'inspect this page for json' },
          ],
        },
      ],
    }));
  });

  // Regression: issue #99. OpenAI 400s on json_object mode unless the word
  // appears in an INPUT message; `instructions` does not count. That broke
  // "describe the form" for every OpenAI tenant, as an opaque 500.
  describe('json mode requires the word in an input message', () => {
    it('appends the requirement when the prompt lacks it', async () => {
      const provider = new OpenAiProvider('test-key', 'gpt-4o');

      await provider.generate(
        'Build a clinical form from this description.',
        'system prompt says JSON but travels as instructions, which does not count',
        { jsonMode: true },
      );

      expect(create.mock.calls[0][0].input).toBe(
        'Build a clinical form from this description.\n\n' +
          'Respond with a single JSON object and nothing else.',
      );
    });

    it('leaves a prompt that already says it untouched', async () => {
      const provider = new OpenAiProvider('test-key', 'gpt-4o');

      // The conversion paths read "into the jsonforms engine format" — the
      // substring is what has been carrying them.
      await provider.generate('Convert into the jsonforms engine format', 'sys', {
        jsonMode: true,
      });

      expect(create.mock.calls[0][0].input).toBe('Convert into the jsonforms engine format');
    });

    it('matches case-insensitively, as the API does', async () => {
      const provider = new OpenAiProvider('test-key', 'gpt-4o');

      await provider.generate('Return JSON only', 'sys', { jsonMode: true });

      expect(create.mock.calls[0][0].input).toBe('Return JSON only');
    });

    it('does not touch the prompt when json mode is off', async () => {
      const provider = new OpenAiProvider('test-key', 'gpt-4o');

      await provider.generate('Summarise this chart', 'sys', {});

      expect(create.mock.calls[0][0].input).toBe('Summarise this chart');
    });

    it('appends to the text part of an image request', async () => {
      const provider = new OpenAiProvider('test-key', 'gpt-4o');

      await provider.generateWithImages(
        'Read the attached page',
        [{ type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' }],
        'sys',
        { jsonMode: true },
      );

      const content = create.mock.calls[0][0].input[0].content;
      expect(content[content.length - 1]).toEqual({
        type: 'input_text',
        text: 'Read the attached page\n\nRespond with a single JSON object and nothing else.',
      });
    });
  });

  it('retains deterministic temperature for models that support sampling controls', async () => {
    const provider = new OpenAiProvider('test-key', 'gpt-4o');

    await provider.generate('user prompt', 'system prompt', { temperature: 0.1 });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.1 }));
  });
});
