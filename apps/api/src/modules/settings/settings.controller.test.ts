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

    await controller.createProvider(tenantUser, undefined, input);

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
      details: { provider: 'openai', scope: 'tenant' },
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('secret-key');
  });
});

describe('SettingsController explicit ?scope', () => {
  it('lets a SUPER_ADMIN reach their OWN tenant with scope=tenant', async () => {
    // The legacy default routes SUPER_ADMIN to the global set, which left them
    // unable to manage their own tenant's keys at all — this is that fix.
    const { controller, providerService } = setup();

    await controller.listProviders(superAdmin, 'tenant');

    expect(providerService.findAll).toHaveBeenCalledWith(superAdmin.tenantId);
  });

  it('routes scope=global to the global sentinel for a SUPER_ADMIN', async () => {
    const { controller, providerService } = setup();

    await controller.listProviders(superAdmin, 'global');

    expect(providerService.findAll).toHaveBeenCalledWith(GLOBAL_AI_CONFIG_TENANT_ID);
  });

  it('forbids a non-SUPER_ADMIN from requesting scope=global', () => {
    const { controller, providerService } = setup();

    // listProviders resolves the scope synchronously, so this throws rather
    // than returning a rejected promise.
    expect(() => controller.listProviders(tenantUser, 'global')).toThrow(/SUPER_ADMIN/);
    expect(providerService.findAll).not.toHaveBeenCalled();
  });

  it('forbids a non-SUPER_ADMIN from mutating the global scope', async () => {
    const { controller, providerService } = setup();

    await expect(
      controller.deleteProvider(tenantUser, '30000000-0000-0000-0000-000000000003', 'global'),
    ).rejects.toThrow(/SUPER_ADMIN/);
    expect(providerService.remove).not.toHaveBeenCalled();
  });

  it('records the scope on the audit entry for a global mutation', async () => {
    const { controller, providerService, audit } = setup();
    providerService.create.mockResolvedValue({
      id: '30000000-0000-0000-0000-000000000003',
      provider: 'claude',
    });

    await controller.createProvider(superAdmin, 'global', {
      provider: 'claude',
      displayName: 'Claude',
      apiKey: 'secret-key',
    });

    expect(providerService.create).toHaveBeenCalledWith(
      GLOBAL_AI_CONFIG_TENANT_ID,
      expect.objectContaining({ provider: 'claude' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: GLOBAL_AI_CONFIG_TENANT_ID,
        details: { provider: 'claude', scope: 'global' },
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('secret-key');
  });
});
