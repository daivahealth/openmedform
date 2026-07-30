import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import {
  AiProviderConfigService,
  GLOBAL_AI_CONFIG_TENANT_ID,
} from './ai-provider-config.service';
import { SettingsController } from './settings.controller';

const tenantUser: RequestUser = {
  userId: '10000000-0000-0000-0000-000000000001',
  tenantId: '20000000-0000-0000-0000-000000000002',
  email: 'user@example.com',
  role: 'CLINICIAN',
};

const superAdmin: RequestUser = {
  ...tenantUser,
  role: 'SUPER_ADMIN',
};

function setup() {
  const providerService = {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const controller = new SettingsController(
    providerService as unknown as AiProviderConfigService,
    audit as unknown as AuditService,
  );

  return { controller, providerService, audit };
}

describe('SettingsController tenant scope', () => {
  it('lists providers in the authenticated tenant scope for normal users', async () => {
    const { controller, providerService } = setup();

    await controller.listProviders(tenantUser);

    expect(providerService.findAll).toHaveBeenCalledWith(tenantUser.tenantId);
  });

  it('keeps SUPER_ADMIN provider configuration in the global scope', async () => {
    const { controller, providerService } = setup();

    await controller.listProviders(superAdmin);

    expect(providerService.findAll).toHaveBeenCalledWith(
      GLOBAL_AI_CONFIG_TENANT_ID,
    );
  });

  it('creates and audits a provider without including its API key', async () => {
    const { controller, providerService, audit } = setup();
    const input = {
      provider: 'openai',
      displayName: 'OpenAI',
      apiKey: 'secret-key',
    };
    providerService.create.mockResolvedValue({
      id: '30000000-0000-0000-0000-000000000003',
      provider: 'openai',
    });

    await controller.createProvider(tenantUser, input);

    expect(providerService.create).toHaveBeenCalledWith(
      tenantUser.tenantId,
      input,
    );
    expect(audit.record).toHaveBeenCalledWith({
      tenantId: tenantUser.tenantId,
      userId: tenantUser.userId,
      action: 'AI_PROVIDER_CREATED',
      resourceType: 'ai_provider_config',
      resourceId: '30000000-0000-0000-0000-000000000003',
      details: { provider: 'openai' },
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('secret-key');
  });
});
