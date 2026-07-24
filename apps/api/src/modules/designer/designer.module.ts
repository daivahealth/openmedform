import { Module } from '@nestjs/common';
import { AiBuilderModule } from '../ai-builder/ai-builder.module';
import { JsonFormsAssemblerService } from '../form-conversion/jsonforms-assembler.service';
import { DesignerController } from './designer.controller';
import { DesignerService } from './designer.service';

@Module({
  imports: [AiBuilderModule],
  controllers: [DesignerController],
  providers: [DesignerService, JsonFormsAssemblerService],
})
export class DesignerModule {}
