import { describe, it, expect, vi } from 'vitest';
import { AdminService } from './admin.service';

const USER_A = '10000000-0000-0000-0000-00000000000a';
const FORM_A = '40000000-0000-0000-0000-00000000000a';

function makeService(groupRows: unknown[], lookups: Record<string, unknown[]> = {}) {
  const groupBy = vi.fn().mockResolvedValue(groupRows);
  const prisma = {
    aiUsage: {
      groupBy,
      aggregate: vi.fn().mockResolvedValue({
        _count: { _all: 3 },
        _sum: { totalTokens: 300, inputTokens: 200, outputTokens: 100 },
      }),
      findMany: vi.fn().mockResolvedValue(lookups.usageSamples ?? []),
    },
    user: { findMany: vi.fn().mockResolvedValue(lookups.users ?? []) },
    form: { findMany: vi.fn().mockResolvedValue(lookups.forms ?? []) },
    tenant: { findMany: vi.fn().mockResolvedValue(lookups.tenants ?? []) },
  };
  return { service: new AdminService(prisma as never), prisma, groupBy };
}

const row = (key: Record<string, string | null>, totalTokens: number) => ({
  ...key,
  _count: { _all: 1 },
  _sum: { totalTokens, inputTokens: totalTokens - 10, outputTokens: 10 },
  _max: { createdAt: new Date('2026-07-01T00:00:00Z') },
});

describe('AdminService.getUsage', () => {
  it('groups by form and resolves form names', async () => {
    const { service, groupBy } = makeService(
      [row({ formId: FORM_A }, 120)],
      { forms: [{ id: FORM_A, name: 'VTE Risk Assessment' }] },
    );

    const result = await service.getUsage({ groupBy: 'form' });

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['formId'] }),
    );
    expect(result.rows).toEqual([
      expect.objectContaining({ key: FORM_A, label: 'VTE Risk Assessment', totalTokens: 120 }),
    ]);
  });

  it('surfaces null keys as "Unattributed" rather than dropping the spend', async () => {
    // Create-runs that never produced a form (and pre-attribution history) must
    // still appear, or the grouped rows would not reconcile with the total.
    const { service } = makeService([row({ formId: null }, 90)]);

    const result = await service.getUsage({ groupBy: 'form' });

    expect(result.rows[0]).toMatchObject({ key: null, label: 'Unattributed', totalTokens: 90 });
  });

  it('labels a key whose entity no longer exists as (deleted)', async () => {
    const { service } = makeService([row({ userId: USER_A }, 50)], { users: [] });

    const result = await service.getUsage({ groupBy: 'user' });

    expect(result.rows[0]).toMatchObject({ key: USER_A, label: '(deleted)' });
  });

  it('uses the provider key directly as its own label', async () => {
    const { service, groupBy } = makeService([row({ provider: 'claude' }, 70)]);

    const result = await service.getUsage({ groupBy: 'provider' });

    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['provider'] }));
    expect(result.rows[0]).toMatchObject({ key: 'claude', label: 'claude' });
  });

  it('sorts rows by total tokens descending', async () => {
    const { service } = makeService([
      row({ provider: 'small' }, 10),
      row({ provider: 'big' }, 500),
      row({ provider: 'mid' }, 100),
    ]);

    const result = await service.getUsage({ groupBy: 'provider' });

    expect(result.rows.map((r) => r.label)).toEqual(['big', 'mid', 'small']);
  });

  it('applies a date window to both the totals and the grouping', async () => {
    const { service, prisma, groupBy } = makeService([]);
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-07-31T00:00:00Z');

    await service.getUsage({ groupBy: 'user', from, to });

    const expected = { where: { createdAt: { gte: from, lte: to } } };
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(prisma.aiUsage.aggregate).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('omits the where clause entirely when no window is given', async () => {
    const { service, groupBy } = makeService([]);

    await service.getUsage({ groupBy: 'tenant' });

    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe('AdminService.getUsage by operation (#128)', () => {
  it('accepts the operation dimension and uses the raw key as the label', async () => {
    const { service, groupBy } = makeService(
      [row({ operation: 'designer.refine' }, 200), row({ operation: 'conversion.jsonforms' }, 100)],
      {
        usageSamples: [
          { operation: 'designer.refine', outputTokens: 10 },
          { operation: 'conversion.jsonforms', outputTokens: 5 },
        ],
      },
    );

    const result = await service.getUsage({ groupBy: 'operation' });

    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['operation'] }));
    expect(result.rows.map((r) => r.label)).toEqual([
      'designer.refine',
      'conversion.jsonforms',
    ]);
  });

  it('attaches p50/p95 of OUTPUT tokens per operation', async () => {
    // 1..20 for refine: p50 = 10, p95 = 19 (ceil(0.95*20)=19th of the sorted list).
    const refineSamples = Array.from({ length: 20 }, (_, i) => ({
      operation: 'designer.refine',
      outputTokens: i + 1,
    }));
    const { service } = makeService(
      [row({ operation: 'designer.refine' }, 210)],
      { usageSamples: refineSamples },
    );

    const result = await service.getUsage({ groupBy: 'operation' });

    expect(result.rows[0]).toMatchObject({ outputP50: 10, outputP95: 19 });
  });

  it('leaves percentiles off rows with no samples, and off other dimensions entirely', async () => {
    const { service: opService } = makeService(
      [row({ operation: 'designer.refine' }, 210)],
      { usageSamples: [] },
    );
    const opResult = await opService.getUsage({ groupBy: 'operation' });
    expect(opResult.rows[0].outputP50).toBeUndefined();

    const { service: provService, prisma } = makeService([row({ provider: 'openai' }, 50)]);
    const provResult = await provService.getUsage({ groupBy: 'provider' });
    expect(provResult.rows[0].outputP50).toBeUndefined();
    // No sample sweep for non-operation views: the fetch never happens.
    expect(prisma.aiUsage.findMany).not.toHaveBeenCalled();
  });
});

