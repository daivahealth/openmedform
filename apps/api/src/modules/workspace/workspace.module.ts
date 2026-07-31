import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { FormModule } from '../form/form.module';
import { AiBuilderModule } from '../ai-builder/ai-builder.module';

@Module({
  imports: [FormModule, AiBuilderModule],
  controllers: [WorkspaceController],
})
export class WorkspaceModule {}
