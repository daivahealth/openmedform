import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, LlmOptions, ImageContent } from './llm-provider.interface';

export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-sonnet-4-6';
  }

  async generate(prompt: string, systemPrompt: string, options?: LlmOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.text ?? '';
  }

  async generateWithImages(
    prompt: string,
    images: ImageContent[],
    systemPrompt: string,
    options?: LlmOptions,
  ): Promise<string> {
    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    for (const img of images) {
      if (img.mediaType === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: img.data },
        });
      } else {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
        });
      }
    }

    contentBlocks.push({ type: 'text', text: prompt });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentBlocks }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.text ?? '';
  }
}
