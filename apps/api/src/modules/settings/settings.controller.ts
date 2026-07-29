import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { AiProviderConfigService, GLOBAL_AI_CONFIG_TENANT_ID } from './ai-provider-config.service';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * AI provider configuration is GLOBAL (platform-wide) and managed only by
 * SUPER_ADMIN — it applies to every tenant (see ProviderRegistry fallback).
 * All routes therefore operate on the global sentinel scope, never on the
 * caller's own tenant.
 */
@Controller('settings')
@Roles('SUPER_ADMIN')
export class SettingsController {
  constructor(
    private readonly aiProviderConfigService: AiProviderConfigService,
  ) {}

  @Get('ai-providers')
  listProviders() {
    return this.aiProviderConfigService.findAll(GLOBAL_AI_CONFIG_TENANT_ID);
  }

  @Post('ai-providers')
  createProvider(
    @Body()
    body: {
      provider: string;
      displayName: string;
      apiKey: string;
      model?: string;
      baseUrl?: string;
      isDefault?: boolean;
    },
  ) {
    return this.aiProviderConfigService.create(GLOBAL_AI_CONFIG_TENANT_ID, body);
  }

  @Put('ai-providers/:id')
  updateProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      displayName?: string;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
      isDefault?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.aiProviderConfigService.update(GLOBAL_AI_CONFIG_TENANT_ID, id, body);
  }

  @Delete('ai-providers/:id')
  deleteProvider(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiProviderConfigService.remove(GLOBAL_AI_CONFIG_TENANT_ID, id);
  }
}
