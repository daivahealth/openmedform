import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, LlmOptions, ImageContent } from './llm-provider.interface';
import { emitUsage } from './usage.util';

export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-sonnet-4-6';
  }

  /**
   * The system prompt as a cacheable block. It is byte-identical across every
   * conversion/refine call (~6.5k tokens), so Anthropic's prompt cache serves
   * it at ~10% of the input price with faster time-to-first-token — but ONLY
   * when explicitly marked; unmarked prompts are never cached (issue #129).
   * Prompts under the model's cacheable minimum (1024 tokens) are simply not
   * cached; the marker is harmless.
   */
  private cacheableSystem(systemPrompt: string): Anthropic.TextBlockParam[] {
    return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }

  async generate(prompt: string, systemPrompt: string, options?: LlmOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.2,
      system: this.cacheableSystem(systemPrompt),
      messages: [{ role: 'user', content: prompt }],
    });

    emitUsage(options, this.model, response.usage);
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
      system: this.cacheableSystem(systemPrompt),
      messages: [{ role: 'user', content: contentBlocks }],
    });

    emitUsage(options, this.model, response.usage);
    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.text ?? '';
  }
}
