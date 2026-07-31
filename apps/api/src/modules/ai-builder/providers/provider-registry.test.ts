import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from './provider-registry';
import {
  AiProviderConfigService,
  GLOBAL_AI_CONFIG_TENANT_ID,
} from '../../settings/ai-provider-config.service';

const TENANT_ID = '20000000-0000-0000-0000-000000000002';

/**
 * getEffectiveSource must mirror getProvidersForTenant's resolution order
 * exactly (tenant -> global -> env) using the cheap boolean check, since it
 * exists purely to describe — never to duplicate the logic of — what will
 * actually serve the tenant's AI calls.
 */
function makeRegistry(opts: {
  tenantHasOwn?: boolean;
  globalHasOwn?: boolean;
  env?: Record<string, string | undefined>;
}) {
  const configService = {
    get: (key: string) => opts.env?.[key],
  };
  const hasOwnActiveProvider = vi
    .fn()
    .mockImplementation((tenantId: string) =>
      Promise.resolve(
        tenantId === TENANT_ID
          ? (opts.tenantHasOwn ?? false)
          : tenantId === GLOBAL_AI_CONFIG_TENANT_ID
            ? (opts.globalHasOwn ?? false)
            : false,
      ),
    );
  const aiProviderConfigService = { hasOwnActiveProvider } as unknown as AiProviderConfigService;
  const registry = new ProviderRegistry(configService as any, aiProviderConfigService);
  return { registry, hasOwnActiveProvider };
}

describe('ProviderRegistry.getEffectiveSource', () => {
  it('returns "tenant" when the tenant has its own active provider', async () => {
    const { registry, hasOwnActiveProvider } = makeRegistry({ tenantHasOwn: true });
    expect(await registry.getEffectiveSource(TENANT_ID)).toBe('tenant');
    // Short-circuits: never checks the global sentinel once tenant is found.
    expect(hasOwnActiveProvider).toHaveBeenCalledTimes(1);
  });

  it('falls back to "global" when the tenant has none but the platform default does', async () => {
    const { registry } = makeRegistry({ tenantHasOwn: false, globalHasOwn: true });
    expect(await registry.getEffectiveSource(TENANT_ID)).toBe('global');
  });

  it('falls back to "env" when neither tenant nor global config exists', async () => {
    const { registry } = makeRegistry({
      tenantHasOwn: false,
      globalHasOwn: false,
      env: { AI_CLAUDE_API_KEY: 'sk-test' },
    });
    expect(await registry.getEffectiveSource(TENANT_ID)).toBe('env');
  });

  it('returns "none" when nothing is configured anywhere', async () => {
    const { registry } = makeRegistry({ tenantHasOwn: false, globalHasOwn: false, env: {} });
    expect(await registry.getEffectiveSource(TENANT_ID)).toBe('none');
  });
});
