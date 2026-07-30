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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { AuditService } from '../../common/audit/audit.service';

/**
 * Tenant users manage their own tenant's AI providers. SUPER_ADMIN continues
 * to manage the global provider set used as the platform fallback.
 */
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly aiProviderConfigService: AiProviderConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get('ai-providers')
  listProviders(@CurrentUser() user: RequestUser) {
    return this.aiProviderConfigService.findAll(this.configTenantId(user));
  }

  @Post('ai-providers')
  async createProvider(
    @CurrentUser() user: RequestUser,
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
    const tenantId = this.configTenantId(user);
    const config = await this.aiProviderConfigService.create(tenantId, body);
    await this.audit.record({
      tenantId,
      userId: user.userId,
      action: 'AI_PROVIDER_CREATED',
      resourceType: 'ai_provider_config',
      resourceId: config.id,
      details: { provider: config.provider },
    });
    return config;
  }

  @Put('ai-providers/:id')
  async updateProvider(
    @CurrentUser() user: RequestUser,
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
    const tenantId = this.configTenantId(user);
    const config = await this.aiProviderConfigService.update(tenantId, id, body);
    await this.audit.record({
      tenantId,
      userId: user.userId,
      action: 'AI_PROVIDER_UPDATED',
      resourceType: 'ai_provider_config',
      resourceId: config.id,
      details: { provider: config.provider },
    });
    return config;
  }

  @Delete('ai-providers/:id')
  async deleteProvider(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = this.configTenantId(user);
    const result = await this.aiProviderConfigService.remove(tenantId, id);
    await this.audit.record({
      tenantId,
      userId: user.userId,
      action: 'AI_PROVIDER_DELETED',
      resourceType: 'ai_provider_config',
      resourceId: id,
    });
    return result;
  }

  private configTenantId(user: RequestUser): string {
    return user.role === 'SUPER_ADMIN'
      ? GLOBAL_AI_CONFIG_TENANT_ID
      : user.tenantId;
  }
}
