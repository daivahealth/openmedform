import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AiProviderConfigService, GLOBAL_AI_CONFIG_TENANT_ID } from './ai-provider-config.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { AuditService } from '../../common/audit/audit.service';

/**
 * Tenant users manage their own tenant's AI providers. SUPER_ADMIN additionally
 * manages the global provider set used as the platform fallback.
 *
 * The scope is chosen explicitly with `?scope=tenant|global` so the two consoles
 * (`/settings` = tenant, `/admin/ai-providers` = global) each say what they
 * mean. Omitting `scope` keeps the historical behaviour (SUPER_ADMIN -> global)
 * for existing clients; note that under that legacy default a SUPER_ADMIN could
 * never reach their OWN tenant's providers, which `?scope=tenant` now fixes.
 */
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly aiProviderConfigService: AiProviderConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get('ai-providers')
  listProviders(@CurrentUser() user: RequestUser, @Query('scope') scope?: string) {
    return this.aiProviderConfigService.findAll(this.configTenantId(user, scope));
  }

  @Post('ai-providers')
  async createProvider(
    @CurrentUser() user: RequestUser,
    @Query('scope') scope: string | undefined,
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
    const tenantId = this.configTenantId(user, scope);
    const config = await this.aiProviderConfigService.create(tenantId, body);
    await this.audit.record({
      tenantId,
      userId: user.userId,
      action: 'AI_PROVIDER_CREATED',
      resourceType: 'ai_provider_config',
      resourceId: config.id,
      details: { provider: config.provider, scope: this.scopeLabel(tenantId) },
    });
    return config;
  }

  @Put('ai-providers/:id')
  async updateProvider(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('scope') scope: string | undefined,
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
    const tenantId = this.configTenantId(user, scope);
    const config = await this.aiProviderConfigService.update(tenantId, id, body);
    await this.audit.record({
      tenantId,
      userId: user.userId,
      action: 'AI_PROVIDER_UPDATED',
      resourceType: 'ai_provider_config',
      resourceId: config.id,
      details: { provider: config.provider, scope: this.scopeLabel(tenantId) },
    });
    return config;
  }

  @Delete('ai-providers/:id')
  async deleteProvider(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('scope') scope?: string,
  ) {
    const tenantId = this.configTenantId(user, scope);
    const result = await this.aiProviderConfigService.remove(tenantId, id);
    await this.audit.record({
      tenantId,
      userId: user.userId,
      action: 'AI_PROVIDER_DELETED',
      resourceType: 'ai_provider_config',
      resourceId: id,
      details: { scope: this.scopeLabel(tenantId) },
    });
    return result;
  }

  /**
   * Resolve which config set the request addresses. Every read and mutation is
   * scoped by the returned tenant id in the service layer, so a non-SUPER_ADMIN
   * can never reach the global rows.
   */
  private configTenantId(user: RequestUser, scope?: string): string {
    if (scope === 'global') {
      if (user.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException(
          'Only a SUPER_ADMIN can manage the global AI provider set.',
        );
      }
      return GLOBAL_AI_CONFIG_TENANT_ID;
    }
    if (scope === 'tenant') return user.tenantId;
    // Legacy default (no scope supplied).
    return user.role === 'SUPER_ADMIN' ? GLOBAL_AI_CONFIG_TENANT_ID : user.tenantId;
  }

  private scopeLabel(tenantId: string): 'global' | 'tenant' {
    return tenantId === GLOBAL_AI_CONFIG_TENANT_ID ? 'global' : 'tenant';
  }
}
