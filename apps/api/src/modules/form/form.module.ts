import { Module } from '@nestjs/common';
import { FormController } from './form.controller';
import { FormService } from './form.service';
import { ScoringModule } from '../scoring/scoring.module';
import { AiBuilderModule } from '../ai-builder/ai-builder.module';
import { FormConversionModule } from '../form-conversion/form-conversion.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ScoringModule, AiBuilderModule, SettingsModule, FormConversionModule],
  controllers: [FormController],
  providers: [FormService],
  exports: [FormService],
})
export class FormModule {}
