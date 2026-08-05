import { describe, expect, it, vi } from 'vitest';

import { TerminologyService } from './terminology.service';
import { CodingSuggestService } from './coding-suggest.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';

const LOINC_ROWS = [
  {
    code: '8867-4',
    component: 'Heart rate',
    longCommonName: 'Heart rate',
    shortName: 'Heart rate',
    relatedNames: 'HR pulse rate beats per minute bpm',
    class: null,
  },
  {
    code: '8887-2',
    component: 'Heart rate 10 hour mean',
    longCommonName: 'Heart rate 10 hour mean',
    shortName: null,
    relatedNames: 'HR mean',
    class: null,
  },
  {
    code: '59408-5',
    component: 'Oxygen saturation',
    longCommonName: 'Oxygen saturation in Arterial blood by Pulse oximetry',
    shortName: 'SaO2 % BldA PulseOx',
    relatedNames: 'SpO2 O2 sat pulse oximetry',
    class: null,
  },
];

function terminologyHarness(rows = LOINC_ROWS) {
  const prisma = {
    loincCode: {
      count: vi.fn().mockResolvedValue(rows.length),
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { code: string } }) =>
          Promise.resolve(rows.find((r) => r.code === where.code) ?? null),
        ),
      // The service filters in SQL then ranks in JS; for the test the SQL
      // filter is approximated by returning everything — ranking is the
      // behaviour under test.
      findMany: vi.fn().mockResolvedValue(rows),
    },
  };
  const config = { get: vi.fn().mockReturnValue(undefined) };
  return { svc: new TerminologyService(prisma as never, config as never), prisma };
}

describe('TerminologyService.searchLoinc', () => {
  it('finds by synonym — the reason relatedNames exists', async () => {
    const { svc } = terminologyHarness();
    const results = await svc.searchLoinc('SpO2 (%)');
    expect(results[0]).toMatchObject({ code: '59408-5' });
  });

  it('ranks the exact-term shorter name above the longer variant', async () => {
    const { svc } = terminologyHarness();
    const results = await svc.searchLoinc('Heart rate');
    expect(results.map((r) => r.code)).toEqual(['8867-4', '8887-2', '59408-5'].slice(0, results.length));
    expect(results[0].code).toBe('8867-4');
  });

  it('short-circuits an exact code lookup', async () => {
    const { svc, prisma } = terminologyHarness();
    const results = await svc.searchLoinc('8867-4');
    expect(results).toEqual([{ code: '8867-4', display: 'Heart rate', shortName: 'Heart rate' }]);
    expect(prisma.loincCode.findMany).not.toHaveBeenCalled();
  });

  it('returns nothing for stopword-only queries', async () => {
    const { svc } = terminologyHarness();
    expect(await svc.searchLoinc('please specify other')).toEqual([]);
  });
});

function suggestHarness(options?: {
  modelResponse?: string;
  loincCount?: number;
  publishedAt?: Date | null;
  existingCoding?: boolean;
}) {
  const uiSchema = {
    layout: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/hr',
          label: 'Heart rate',
          ...(options?.existingCoding
            ? { options: { omf: { coding: [{ system: 'x', code: 'y', source: 'human', verified: true }] } } }
            : {}),
        },
        { type: 'Control', scope: '#/properties/notes', label: 'Nursing notes' },
      ],
    },
  };
  const version = {
    id: 'v1',
    version: 1,
    publishedAt: options?.publishedAt ?? null,
    uiSchema,
  };
  const versionWrites: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];

  const prisma = {
    loincCode: {
      count: vi.fn().mockResolvedValue(options?.loincCount ?? LOINC_ROWS.length),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(LOINC_ROWS),
    },
    form: {
      findFirst: vi.fn().mockResolvedValue({ id: FORM_ID, versions: [version] }),
    },
    formVersion: {
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        versionWrites.push(data);
        return Promise.resolve({ id: 'v1' });
      }),
    },
  };
  const generate = vi
    .fn()
    .mockResolvedValue(
      options?.modelResponse ??
        JSON.stringify({
          selections: [
            { key: '#/properties/hr', code: '8867-4', confidence: 0.94 },
            { key: '#/properties/notes', code: null, confidence: 0 },
          ],
        }),
    );
  const provider = { name: 'p', generate };
  (prisma as Record<string, unknown>).icd10Code = { count: vi.fn().mockResolvedValue(0) };
  (prisma as Record<string, unknown>).tenant = {
    findUnique: vi.fn().mockResolvedValue({ settings: {} }),
  };
  const config = { get: vi.fn().mockReturnValue(undefined) };
  const terminology = new TerminologyService(prisma as never, config as never);

  const svc = new CodingSuggestService(
    prisma as never,
    { record: vi.fn().mockImplementation((r: Record<string, unknown>) => audits.push(r)) } as never,
    {
      getProvidersForTenant: vi.fn().mockResolvedValue({}),
      getProvider: vi.fn().mockReturnValue(provider),
    } as never,
    { meter: vi.fn().mockReturnValue(provider) } as never,
    terminology,
  );
  return { svc, generate, versionWrites, audits };
}

describe('CodingSuggestService', () => {
  it('writes a chosen candidate as an unverified AI suggestion, in one call', async () => {
    const { svc, generate, versionWrites, audits } = suggestHarness();

    const result = await svc.suggestForForm(TENANT, FORM_ID, { userId: 'u1' });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.suggested).toBe(1);
    const written = JSON.stringify(versionWrites[0]);
    expect(written).toContain('"code":"8867-4"');
    expect(written).toContain('"source":"ai"');
    expect(written).toContain('"verified":false');
    expect(audits[0]).toMatchObject({ action: 'form.coding.suggest' });
  });

  it('drops a code the model invented — it was not among the candidates', async () => {
    const { svc, versionWrites } = suggestHarness({
      modelResponse: JSON.stringify({
        selections: [{ key: '#/properties/hr', code: '99999-9', confidence: 0.99 }],
      }),
    });

    const result = await svc.suggestForForm(TENANT, FORM_ID, {});
    expect(result.suggested).toBe(0);
    expect(versionWrites).toHaveLength(0);
  });

  it('drops selections below the confidence floor', async () => {
    const { svc, versionWrites } = suggestHarness({
      modelResponse: JSON.stringify({
        selections: [{ key: '#/properties/hr', code: '8867-4', confidence: 0.3 }],
      }),
    });

    const result = await svc.suggestForForm(TENANT, FORM_ID, {});
    expect(result.suggested).toBe(0);
    expect(versionWrites).toHaveLength(0);
  });

  it('never targets a field that already has a binding', async () => {
    const { svc, generate } = suggestHarness({ existingCoding: true });

    await svc.suggestForForm(TENANT, FORM_ID, {});

    const prompt = String(generate.mock.calls[0]?.[0] ?? '');
    expect(prompt).not.toContain('#/properties/hr');
  });

  it('refuses to run with no LOINC table, naming the fix', async () => {
    const { svc } = suggestHarness({ loincCount: 0 });

    await expect(svc.suggestForForm(TENANT, FORM_ID, {})).rejects.toThrow(/LOINC/);
  });

  it('survives a malformed model response with zero suggestions, not an error', async () => {
    const { svc, versionWrites } = suggestHarness({ modelResponse: 'not json at all' });

    const result = await svc.suggestForForm(TENANT, FORM_ID, {});
    expect(result.suggested).toBe(0);
    expect(versionWrites).toHaveLength(0);
  });
});
