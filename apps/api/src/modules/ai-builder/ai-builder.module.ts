import { Module } from '@nestjs/common';
import { AiBuilderController } from './ai-builder.controller';
import { AiBuilderService } from './ai-builder.service';
import { AiUsageService } from './ai-usage.service';
import { ProviderRegistry } from './providers/provider-registry';
import { SchemaAssemblerService } from './schema-assembler.service';
import { SchemaValidatorService } from './schema-validator.service';
import { SchemaPreviewRendererService } from './schema-preview-renderer.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [AiBuilderController],
  providers: [
    AiBuilderService,
    AiUsageService,
    ProviderRegistry,
    SchemaAssemblerService,
    SchemaValidatorService,
    SchemaPreviewRendererService,
  ],
  exports: [AiBuilderService, AiUsageService, ProviderRegistry],
})
export class AiBuilderModule {}
