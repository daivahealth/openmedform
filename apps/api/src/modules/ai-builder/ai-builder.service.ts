import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ProviderRegistry } from './providers/provider-registry';
import { SchemaAssemblerService } from './schema-assembler.service';
import { SchemaValidatorService } from './schema-validator.service';
import { getSystemPrompt } from './prompts/system-prompt';
import { getComponentCatalog } from './prompts/component-catalog';

@Injectable()
export class AiBuilderService {
  private readonly logger = new Logger(AiBuilderService.name);

  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly assembler: SchemaAssemblerService,
    private readonly validator: SchemaValidatorService,
  ) {}

  async generate(
    prompt: string,
    providerName?: string,
    category?: string,
  ): Promise<{ schema: Record<string, unknown>; provider: string }> {
    const provider = providerName
      ? this.providerRegistry.getProvider(providerName)
      : this.providerRegistry.getDefaultProvider();

    if (!provider) {
      throw new BadRequestException(
        providerName
          ? `Provider "${providerName}" is not configured`
          : 'No AI providers are configured. Set AI_CLAUDE_API_KEY or AI_OPENAI_API_KEY in environment variables.',
      );
    }

    const systemPrompt = this.buildSystemPrompt(category);
    const userPrompt = `Create a clinical form based on this description:\n\n${prompt}`;

    this.logger.log(`Generating form with provider: ${provider.name}`);

    const rawOutput = await provider.generate(userPrompt, systemPrompt, {
      temperature: 0.2,
      maxTokens: 8192,
      jsonMode: true,
    });

    const schema = this.assembler.assemble(rawOutput);
    const validation = this.validator.validate(schema);

    if (!validation.valid) {
      this.logger.warn(
        `Schema validation errors: ${validation.errors.join(', ')}`,
      );
    }

    return { schema, provider: provider.name };
  }

  async refine(
    currentSchema: Record<string, unknown>,
    instruction: string,
    conversationHistory?: Array<{ role: string; content: string }>,
    providerName?: string,
  ): Promise<{ schema: Record<string, unknown>; provider: string }> {
    const provider = providerName
      ? this.providerRegistry.getProvider(providerName)
      : this.providerRegistry.getDefaultProvider();

    if (!provider) {
      throw new BadRequestException('No AI providers are configured');
    }

    const systemPrompt = this.buildSystemPrompt();

    let userPrompt = '';
    if (conversationHistory?.length) {
      userPrompt += 'Previous conversation:\n';
      for (const msg of conversationHistory) {
        userPrompt += `${msg.role}: ${msg.content}\n`;
      }
      userPrompt += '\n';
    }
    userPrompt += `Current form schema:\n${JSON.stringify(currentSchema, null, 2)}\n\n`;
    userPrompt += `Modify the form based on this instruction:\n${instruction}\n\n`;
    userPrompt += 'Return the complete updated form schema as JSON.';

    this.logger.log(`Refining form with provider: ${provider.name}`);

    const rawOutput = await provider.generate(userPrompt, systemPrompt, {
      temperature: 0.2,
      maxTokens: 8192,
      jsonMode: true,
    });

    const schema = this.assembler.assemble(rawOutput);
    const validation = this.validator.validate(schema);

    if (!validation.valid) {
      this.logger.warn(
        `Refinement validation errors: ${validation.errors.join(', ')}`,
      );
    }

    return { schema, provider: provider.name };
  }

  listProviders(): string[] {
    return this.providerRegistry.listProviders();
  }

  private buildSystemPrompt(category?: string): string {
    let prompt = getSystemPrompt();
    prompt += '\n\n' + getComponentCatalog();
    if (category) {
      prompt += `\n\nThe form should be categorized as: ${category}`;
    }
    return prompt;
  }
}
