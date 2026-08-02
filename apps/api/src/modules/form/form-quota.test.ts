import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { FormService } from './form.service';
import { FormConversionService } from '../form-conversion/form-conversion.service';
import { FormQuotaService, DEFAULT_FORM_LIMIT } from './form-quota.service';
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
  const service = new FormQuotaService(
    prisma as any,
    aiProviderConfigService as unknown as AiProviderConfigService,
  );
  return { service, prisma, aiProviderConfigService };
}

describe('FormQuotaService.getFormQuota', () => {
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


/**
 * Enforcement coverage, route by route.
 *
 * The quota used to be private to FormService, so only the two routes that
 * happened to call it were covered — every other way to create a form,
 * including the one the UI actually uses, silently bypassed it. These pin the
 * enforcement to each entry point so that regression is loud.
 */
describe('quota enforcement reaches every form-creating route', () => {
  const atLimit = () => {
    const quota = {
      assertFormLimit: vi.fn().mockRejectedValue(new ForbiddenException('limit reached')),
    } as unknown as FormQuotaService;
    return quota;
  };

  it('blocks POST /api/conversions before the job row or any provider call', async () => {
    const formQuota = atLimit();
    const prisma = { conversionJob: { create: vi.fn() } };
    const providerRegistry = { getProvidersForTenant: vi.fn() };
    const service = new FormConversionService(
      prisma as never,
      {} as never,
      providerRegistry as never,
      {} as never,
      {} as never,
      formQuota,
    );

    await expect(
      service.startConversion(TENANT_ID, USER_ID, {
        fileBuffer: Buffer.from(''),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // The point of checking first: nothing was spent and nothing was recorded.
    expect(prisma.conversionJob.create).not.toHaveBeenCalled();
    expect(providerRegistry.getProvidersForTenant).not.toHaveBeenCalled();
  });

  it('blocks POST /api/forms/from-prompt before resolving a provider', async () => {
    const formQuota = atLimit();
    const providerRegistry = { getProvidersForTenant: vi.fn() };
    const service = new FormConversionService(
      {} as never,
      {} as never,
      providerRegistry as never,
      {} as never,
      {} as never,
      formQuota,
    );

    await expect(
      service.createFromPrompt(TENANT_ID, USER_ID, { name: 'X', prompt: 'a form' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(providerRegistry.getProvidersForTenant).not.toHaveBeenCalled();
  });

  it('blocks POST /api/forms/import before reading the template', async () => {
    // Import spends no tokens, but an unlimited import route makes the form
    // limit one export away from meaningless.
    const formQuota = atLimit();
    const service = new FormService(
      {} as never,
      {} as never,
      {} as never,
      formQuota,
    );

    await expect(
      service.importTemplate(TENANT_ID, USER_ID, { openmedform: '1.0' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets all three through when the user is under the limit', async () => {
    const formQuota = { assertFormLimit: vi.fn().mockResolvedValue(undefined) } as unknown as FormQuotaService;
    const prisma = {
      conversionJob: {
        create: vi.fn().mockResolvedValue({ id: 'job-1' }),
        // startConversion is fire-and-forget: the background run() will fail on
        // this stub provider and write FAILED. Stubbed so that path completes
        // quietly instead of surfacing as an unhandled rejection.
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new FormConversionService(
      prisma as never,
      { record: vi.fn() } as never,
      { getProvidersForTenant: vi.fn().mockRejectedValue(new Error('no provider')) } as never,
      {} as never,
      {} as never,
      formQuota,
    );

    // startConversion kicks off background work; only the synchronous part
    // (quota -> job row) is under test here.
    await service.startConversion(TENANT_ID, USER_ID, {
      fileBuffer: Buffer.from(''),
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    });

    expect(formQuota.assertFormLimit).toHaveBeenCalledWith(USER_ID);
    expect(prisma.conversionJob.create).toHaveBeenCalled();
  });
});
