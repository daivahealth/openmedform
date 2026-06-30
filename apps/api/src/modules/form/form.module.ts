import { Module } from '@nestjs/common';
import { FormController } from './form.controller';
import { FormService } from './form.service';
import { ScoringModule } from '../scoring/scoring.module';
import { AiBuilderModule } from '../ai-builder/ai-builder.module';

@Module({
  imports: [ScoringModule, AiBuilderModule],
  controllers: [FormController],
  providers: [FormService],
  exports: [FormService],
})
export class FormModule {}
