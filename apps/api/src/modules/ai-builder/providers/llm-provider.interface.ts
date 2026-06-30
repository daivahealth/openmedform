export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ImageContent {
  type: 'image';
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
  data: string;
}

export interface LlmProvider {
  readonly name: string;
  generate(prompt: string, systemPrompt: string, options?: LlmOptions): Promise<string>;
  generateWithImages?(prompt: string, images: ImageContent[], systemPrompt: string, options?: LlmOptions): Promise<string>;
}
