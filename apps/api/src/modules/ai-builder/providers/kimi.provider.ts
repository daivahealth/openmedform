import OpenAI from 'openai';
import { LlmProvider, LlmOptions } from './llm-provider.interface';

export class KimiProvider implements LlmProvider {
  readonly name = 'kimi';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({
      baseURL: 'https://api.moonshot.cn/v1',
      apiKey,
    });
    this.model = model || 'moonshot-v1-8k';
  }

  async generate(prompt: string, systemPrompt: string, options?: LlmOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
