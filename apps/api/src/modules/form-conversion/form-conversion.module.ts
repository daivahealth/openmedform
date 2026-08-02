import { Module } from '@nestjs/common';
import { AiBuilderModule } from '../ai-builder/ai-builder.module';
import { FormQuotaModule } from '../form/form-quota.module';
import { FormConversionController } from './form-conversion.controller';
import { FormConversionService } from './form-conversion.service';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';

@Module({
  imports: [AiBuilderModule, FormQuotaModule],
  controllers: [FormConversionController],
  providers: [FormConversionService, JsonFormsAssemblerService],
  exports: [FormConversionService],
})
export class FormConversionModule {}
