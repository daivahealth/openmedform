import { Module } from '@nestjs/common';
import { AiBuilderController } from './ai-builder.controller';
import { AiBuilderService } from './ai-builder.service';
import { ProviderRegistry } from './providers/provider-registry';
import { SchemaAssemblerService } from './schema-assembler.service';
import { SchemaValidatorService } from './schema-validator.service';

@Module({
  controllers: [AiBuilderController],
  providers: [
    AiBuilderService,
    ProviderRegistry,
    SchemaAssemblerService,
    SchemaValidatorService,
  ],
  exports: [AiBuilderService],
})
export class AiBuilderModule {}
