import OpenAI from 'openai';
import { LlmProvider, LlmOptions, ImageContent } from './llm-provider.interface';
import { emitUsage } from './usage.util';

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model || 'gpt-4o';
  }

  async generate(prompt: string, systemPrompt: string, options?: LlmOptions): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      max_output_tokens: options?.maxTokens ?? 8192,
      ...this.samplingOptions(options),
      instructions: systemPrompt,
      input: this.withJsonRequirement(prompt, options),
      ...(options?.jsonMode && { text: { format: { type: 'json_object' as const } } }),
    });

    emitUsage(options, this.model, response.usage);
    return response.output_text;
  }

  async generateWithImages(
    prompt: string,
    images: ImageContent[],
    systemPrompt: string,
    options?: LlmOptions,
  ): Promise<string> {
    const contentParts: Array<
      | { type: 'input_image'; image_url: string; detail: 'high' }
      | { type: 'input_text'; text: string }
    > = [];

    for (const img of images) {
      contentParts.push({
        type: 'input_image',
        image_url: `data:${img.mediaType};base64,${img.data}`,
        detail: 'high',
      });
    }

    contentParts.push({ type: 'input_text', text: this.withJsonRequirement(prompt, options) });

    const response = await this.client.responses.create({
      model: this.model,
      max_output_tokens: options?.maxTokens ?? 8192,
      ...this.samplingOptions(options),
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: contentParts,
        },
      ],
      ...(options?.jsonMode && { text: { format: { type: 'json_object' as const } } }),
    });

    emitUsage(options, this.model, response.usage);
    return response.output_text;
  }

  /**
   * Guarantee the word "json" reaches an input message when json mode is on.
   *
   * OpenAI rejects `text.format: json_object` outright — a 400, surfacing as an
   * opaque 500 to the user — unless "json" appears in an **input** message. The
   * system prompt does not satisfy it: it travels as `instructions`, a separate
   * field, however many times it says JSON.
   *
   * This lived at the call sites and did not scale. Two of them satisfy the
   * requirement only by accident, through the substring inside "jsonforms"; one
   * carries an explicit reminder comment; and `createFromPrompt` never got one,
   * which broke "describe the form" for every OpenAI tenant while Claude
   * tenants saw nothing wrong. A prompt-content rule imposed by a remote API
   * belongs in the adapter that knows about it, not in nine callers who have to
   * remember. See issue #99.
   *
   * Only appended when genuinely absent, so prompts that already say it are
   * sent unchanged and their tuned output is unaffected.
   */
  private withJsonRequirement(prompt: string, options?: LlmOptions): string {
    if (!options?.jsonMode || /json/i.test(prompt)) return prompt;
    return `${prompt}\n\nRespond with a single JSON object and nothing else.`;
  }

  /** GPT-5 and OpenAI reasoning models do not accept temperature overrides. */
  private samplingOptions(options?: LlmOptions): { temperature?: number } {
    const model = this.model.toLowerCase();
    if (
      model.startsWith('gpt-5') ||
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('o4')
    ) {
      return {};
    }
    return { temperature: options?.temperature ?? 0.2 };
  }
}
