import { Module } from '@nestjs/common';
import { AiBuilderController } from './ai-builder.controller';
import { AiUsageService } from './ai-usage.service';
import { ProviderRegistry } from './providers/provider-registry';
import { SettingsModule } from '../settings/settings.module';

/**
 * Multi-provider LLM plumbing shared by every AI feature: provider resolution
 * (tenant → global → env) and token-usage accounting.
 *
 * The Form.io schema generator that used to live here was removed with the
 * engine; the JSON Forms generation prompts live in `prompts/` and are consumed
 * by the form-conversion and designer modules.
 */
@Module({
  imports: [SettingsModule],
  controllers: [AiBuilderController],
  providers: [AiUsageService, ProviderRegistry],
  exports: [AiUsageService, ProviderRegistry],
})
export class AiBuilderModule {}
