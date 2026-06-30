import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { AiProviderConfigService } from './ai-provider-config.service';

@Module({
  controllers: [SettingsController],
  providers: [AiProviderConfigService],
  exports: [AiProviderConfigService],
})
export class SettingsModule {}
