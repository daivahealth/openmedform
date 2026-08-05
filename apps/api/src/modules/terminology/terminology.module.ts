import { Module } from '@nestjs/common';
import { AiBuilderModule } from '../ai-builder/ai-builder.module';
import { TerminologyController } from './terminology.controller';
import { TerminologyService } from './terminology.service';
import { CodingSuggestService } from './coding-suggest.service';

@Module({
  imports: [AiBuilderModule],
  controllers: [TerminologyController],
  providers: [TerminologyService, CodingSuggestService],
  exports: [TerminologyService],
})
export class TerminologyModule {}
