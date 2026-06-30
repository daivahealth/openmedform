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
    const response = await this.client.chat.completions.create({
      model: this.model,
      ...this.getTokenLimitParam(options?.maxTokens ?? 8192),
      temperature: options?.temperature ?? 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      ...(options?.jsonMode && { response_format: { type: 'json_object' as const } }),
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async generateWithImages(
    prompt: string,
    images: ImageContent[],
    systemPrompt: string,
    options?: LlmOptions,
  ): Promise<string> {
    const contentParts: OpenAI.ChatCompletionContentPart[] = [];

    for (const img of images) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mediaType};base64,${img.data}`,
          detail: 'high',
        },
      });
    }

    contentParts.push({ type: 'text', text: prompt });

    const response = await this.client.chat.completions.create({
      model: this.model,
      ...this.getTokenLimitParam(options?.maxTokens ?? 8192),
      temperature: options?.temperature ?? 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
      ],
      ...(options?.jsonMode && { response_format: { type: 'json_object' as const } }),
    });

    return response.choices[0]?.message?.content ?? '';
  }

  private getTokenLimitParam(maxTokens: number) {
    if (this.requiresMaxCompletionTokens()) {
      return { max_completion_tokens: maxTokens };
    }

    return { max_tokens: maxTokens };
  }

  private requiresMaxCompletionTokens(): boolean {
    const model = this.model.toLowerCase();
    return (
      model.startsWith('gpt-5') ||
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('o4')
    );
  }
}
