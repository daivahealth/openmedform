import OpenAI from 'openai';
import { LlmProvider, LlmOptions, ImageContent } from './llm-provider.interface';

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
      input: prompt,
      ...(options?.jsonMode && { text: { format: { type: 'json_object' as const } } }),
    });

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

    contentParts.push({ type: 'input_text', text: prompt });

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

    return response.output_text;
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
