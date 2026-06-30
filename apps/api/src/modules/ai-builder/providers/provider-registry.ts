import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm-provider.interface';
import { ClaudeProvider } from './claude.provider';
import { OpenAiProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { MinimaxProvider } from './minimax.provider';
import { KimiProvider } from './kimi.provider';
import { AiProviderConfigService } from '../../settings/ai-provider-config.service';

interface ProviderSet {
  providers: Map<string, LlmProvider>;
  defaultName: string;
}

@Injectable()
export class ProviderRegistry {
  constructor(
    private readonly configService: ConfigService,
    private readonly aiProviderConfigService: AiProviderConfigService,
  ) {}

  async getProvidersForTenant(tenantId: string): Promise<ProviderSet> {
    const dbConfigs =
      await this.aiProviderConfigService.getDecryptedConfigs(tenantId);

    if (dbConfigs.length > 0) {
      const providers = new Map<string, LlmProvider>();

      for (const cfg of dbConfigs) {
        const provider = this.createProvider(
          cfg.provider,
          cfg.apiKey,
          cfg.model ?? undefined,
          cfg.baseUrl ?? undefined,
        );
        if (provider) {
          providers.set(cfg.provider, provider);
        }
      }

      const defaultCfg = dbConfigs.find((c) => c.isDefault);
      const defaultName =
        defaultCfg?.provider ?? providers.keys().next().value ?? '';

      return { providers, defaultName };
    }

    return this.getEnvProviders();
  }

  getProvider(
    set: ProviderSet,
    name?: string,
  ): LlmProvider | undefined {
    if (name) return set.providers.get(name);
    return set.providers.get(set.defaultName);
  }

  listProviderNames(set: ProviderSet): string[] {
    return Array.from(set.providers.keys());
  }

  private getEnvProviders(): ProviderSet {
    const providers = new Map<string, LlmProvider>();

    const claudeKey = this.configService.get<string>('AI_CLAUDE_API_KEY');
    if (claudeKey) {
      providers.set(
        'claude',
        new ClaudeProvider(
          claudeKey,
          this.configService.get<string>('AI_CLAUDE_MODEL'),
        ),
      );
    }

    const openaiKey = this.configService.get<string>('AI_OPENAI_API_KEY');
    if (openaiKey) {
      providers.set(
        'openai',
        new OpenAiProvider(
          openaiKey,
          this.configService.get<string>('AI_OPENAI_MODEL'),
        ),
      );
    }

    const minimaxKey = this.configService.get<string>('AI_MINIMAX_API_KEY');
    if (minimaxKey) {
      providers.set(
        'minimax',
        new MinimaxProvider(
          minimaxKey,
          this.configService.get<string>('AI_MINIMAX_MODEL'),
        ),
      );
    }

    const kimiKey = this.configService.get<string>('AI_KIMI_API_KEY');
    if (kimiKey) {
      providers.set(
        'kimi',
        new KimiProvider(
          kimiKey,
          this.configService.get<string>('AI_KIMI_MODEL'),
        ),
      );
    }

    const ollamaUrl = this.configService.get<string>('AI_OLLAMA_BASE_URL');
    if (ollamaUrl) {
      providers.set(
        'ollama',
        new OllamaProvider(
          ollamaUrl,
          this.configService.get<string>('AI_OLLAMA_MODEL'),
        ),
      );
    }

    const envDefault =
      this.configService.get<string>('AI_DEFAULT_PROVIDER') ?? '';
    const defaultName =
      envDefault && providers.has(envDefault)
        ? envDefault
        : providers.keys().next().value ?? '';

    return { providers, defaultName };
  }

  private createProvider(
    type: string,
    apiKey: string,
    model?: string,
    baseUrl?: string,
  ): LlmProvider | null {
    switch (type) {
      case 'claude':
        return new ClaudeProvider(apiKey, model);
      case 'openai':
        return new OpenAiProvider(apiKey, model);
      case 'minimax':
        return new MinimaxProvider(apiKey, model);
      case 'kimi':
        return new KimiProvider(apiKey, model);
      case 'ollama':
        return new OllamaProvider(baseUrl ?? 'http://localhost:11434/v1', model);
      default:
        return null;
    }
  }
}
