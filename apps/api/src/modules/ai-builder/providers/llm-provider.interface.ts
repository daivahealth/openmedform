export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmProvider {
  readonly name: string;
  generate(prompt: string, systemPrompt: string, options?: LlmOptions): Promise<string>;
}
