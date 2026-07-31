import { describe, it, expect, vi } from 'vitest';
import { FormService, DEFAULT_FORM_LIMIT } from './form.service';
import { AiProviderConfigService } from '../settings/ai-provider-config.service';

const TENANT_ID = '20000000-0000-0000-0000-000000000002';
const USER_ID = '10000000-0000-0000-0000-000000000001';

/**
 * getFormQuota is the single source of truth for both enforcement
 * (assertFormLimit) and the dashboard notice — these tests pin its behavior
 * directly rather than through the create-form flow, and specifically pin
 * the "own AI provider" check against the tenant's OWN id (never the global
 * sentinel) since that is the exact bug that would silently disable the
 * free-tier limit for every tenant.
 */
function makeService(opts: {
  role?: string;
  formLimit?: number | null;
  used?: number;
  hasOwnProvider?: boolean;
}) {
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        role: opts.role ?? 'CLINICIAN',
        formLimit: opts.formLimit ?? null,
        tenantId: TENANT_ID,
      }),
    },
    form: {
      count: vi.fn().mockResolvedValue(opts.used ?? 0),
    },
  };
  const aiProviderConfigService = {
    hasOwnActiveProvider: vi.fn().mockResolvedValue(opts.hasOwnProvider ?? false),
  };
  const service = new FormService(
    prisma as any,
    {} as any,
    {} as any,
    aiProviderConfigService as unknown as AiProviderConfigService,
  );
  return { service, prisma, aiProviderConfigService };
}

describe('FormService.getFormQuota', () => {
  it('is unlimited and exempt for SUPER_ADMIN, without touching provider config', async () => {
    const { service, aiProviderConfigService } = makeService({ role: 'SUPER_ADMIN' });
    const quota = await service.getFormQuota(USER_ID);
    expect(quota).toEqual({ used: 0, limit: null, remaining: null, unlimited: true, reason: 'super-admin' });
    expect(aiProviderConfigService.hasOwnActiveProvider).not.toHaveBeenCalled();
  });

  it('defaults a normal user to DEFAULT_FORM_LIMIT with remaining computed', async () => {
    const { service } = makeService({ used: 2 });
    const quota = await service.getFormQuota(USER_ID);
    expect(quota).toEqual({
      used: 2,
      limit: DEFAULT_FORM_LIMIT,
      remaining: DEFAULT_FORM_LIMIT - 2,
      unlimited: false,
      reason: 'default',
    });
  });

  it('clamps remaining to 0 when at or over the limit (never negative)', async () => {
    const { service } = makeService({ used: DEFAULT_FORM_LIMIT + 3 });
    const quota = await service.getFormQuota(USER_ID);
    expect(quota.remaining).toBe(0);
    expect(quota.unlimited).toBe(false);
  });

  it('reports admin-raised when user.formLimit is explicitly set', async () => {
    const { service } = makeService({ formLimit: 50, used: 10 });
    const quota = await service.getFormQuota(USER_ID);
    expect(quota).toMatchObject({ limit: 50, remaining: 40, reason: 'admin-raised' });
  });

  it('is unlimited when the tenant has its own active AI provider', async () => {
    const { service, aiProviderConfigService } = makeService({ hasOwnProvider: true, used: 1 });
    const quota = await service.getFormQuota(USER_ID);
    expect(quota).toEqual({ used: 1, limit: null, remaining: null, unlimited: true, reason: 'own-ai-provider' });
    // Critical: checked against the tenant's OWN id, never the global sentinel.
    expect(aiProviderConfigService.hasOwnActiveProvider).toHaveBeenCalledTimes(1);
    expect(aiProviderConfigService.hasOwnActiveProvider).toHaveBeenCalledWith(TENANT_ID);
  });

  it('still enforces the default limit when the tenant has no own AI provider', async () => {
    const { service } = makeService({ hasOwnProvider: false, used: DEFAULT_FORM_LIMIT });
    const quota = await service.getFormQuota(USER_ID);
    expect(quota.unlimited).toBe(false);
    expect(quota.remaining).toBe(0);
  });
});
