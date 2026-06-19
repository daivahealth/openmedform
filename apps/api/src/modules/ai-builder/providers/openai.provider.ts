import OpenAI from 'openai';
import { LlmProvider, LlmOptions } from './llm-provider.interface';

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
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      ...(options?.jsonMode && { response_format: { type: 'json_object' as const } }),
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
