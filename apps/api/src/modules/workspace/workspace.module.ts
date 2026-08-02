import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { FormQuotaModule } from '../form/form-quota.module';
import { AiBuilderModule } from '../ai-builder/ai-builder.module';

@Module({
  imports: [FormQuotaModule, AiBuilderModule],
  controllers: [WorkspaceController],
})
export class WorkspaceModule {}
