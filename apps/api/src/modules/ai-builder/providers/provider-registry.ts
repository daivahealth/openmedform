import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm-provider.interface';
import { ClaudeProvider } from './claude.provider';
import { OpenAiProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { MinimaxProvider } from './minimax.provider';
import { KimiProvider } from './kimi.provider';

@Injectable()
export class ProviderRegistry {
  private providers = new Map<string, LlmProvider>();
  private defaultProviderName: string;

  constructor(private configService: ConfigService) {
    const claudeKey = this.configService.get<string>('AI_CLAUDE_API_KEY');
    if (claudeKey) {
      const model = this.configService.get<string>('AI_CLAUDE_MODEL');
      this.providers.set('claude', new ClaudeProvider(claudeKey, model));
    }

    const openaiKey = this.configService.get<string>('AI_OPENAI_API_KEY');
    if (openaiKey) {
      const model = this.configService.get<string>('AI_OPENAI_MODEL');
      this.providers.set('openai', new OpenAiProvider(openaiKey, model));
    }

    const minimaxKey = this.configService.get<string>('AI_MINIMAX_API_KEY');
    if (minimaxKey) {
      const model = this.configService.get<string>('AI_MINIMAX_MODEL');
      this.providers.set('minimax', new MinimaxProvider(minimaxKey, model));
    }

    const kimiKey = this.configService.get<string>('AI_KIMI_API_KEY');
    if (kimiKey) {
      const model = this.configService.get<string>('AI_KIMI_MODEL');
      this.providers.set('kimi', new KimiProvider(kimiKey, model));
    }

    const ollamaBaseUrl = this.configService.get<string>('AI_OLLAMA_BASE_URL');
    if (ollamaBaseUrl) {
      const model = this.configService.get<string>('AI_OLLAMA_MODEL');
      this.providers.set('ollama', new OllamaProvider(ollamaBaseUrl, model));
    }

    const envDefault = this.configService.get<string>('AI_DEFAULT_PROVIDER');
    if (envDefault && this.providers.has(envDefault)) {
      this.defaultProviderName = envDefault;
    } else {
      this.defaultProviderName = this.providers.keys().next().value ?? '';
    }
  }

  getProvider(name: string): LlmProvider | undefined {
    return this.providers.get(name);
  }

  getDefaultProvider(): LlmProvider | undefined {
    return this.providers.get(this.defaultProviderName);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
