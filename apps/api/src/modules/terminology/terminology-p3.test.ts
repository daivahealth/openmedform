import { afterEach, describe, expect, it, vi } from 'vitest';

import { TerminologyService } from './terminology.service';
import { CodingSuggestService } from './coding-suggest.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';

const ICD_ROWS = [
  { code: 'E11', title: 'Type 2 diabetes mellitus', shortName: 'Type 2 diabetes', billable: false },
  { code: 'I10', title: 'Essential (primary) hypertension', shortName: 'Hypertension', billable: true },
];

function harness(options?: {
  snomedUrl?: string;
  snomedEnabled?: boolean;
  loincCount?: number;
  icdCount?: number;
}) {
  const prisma = {
    loincCode: {
      count: vi.fn().mockResolvedValue(options?.loincCount ?? 5),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    icd10Code: {
      count: vi.fn().mockResolvedValue(options?.icdCount ?? ICD_ROWS.length),
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { code: string } }) =>
          Promise.resolve(ICD_ROWS.find((r) => r.code === where.code) ?? null),
        ),
      findMany: vi.fn().mockResolvedValue(ICD_ROWS),
    },
    tenant: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ settings: { snomedEnabled: options?.snomedEnabled === true } }),
    },
  };
  const config = {
    get: vi.fn().mockImplementation((key: string) =>
      key === 'SNOMED_FHIR_URL' ? options?.snomedUrl : undefined,
    ),
  };
  return { svc: new TerminologyService(prisma as never, config as never), prisma };
}

describe('systemsForTenant — the licensing gate (#136)', () => {
  it('LOINC and ICD-10 are gated only on loaded data', async () => {
    const { svc } = harness({ icdCount: 0 });
    const systems = await svc.systemsForTenant(TENANT);

    expect(systems.find((s) => s.system === 'loinc')).toMatchObject({ available: true, loaded: 5 });
    expect(systems.find((s) => s.system === 'icd10')).toMatchObject({ available: false });
    expect(systems.find((s) => s.system === 'icd10')?.reason).toContain('import-icd10');
  });

  it('SNOMED needs BOTH the server config AND the tenant entitlement', async () => {
    const neither = await harness().svc.systemsForTenant(TENANT);
    expect(neither.find((s) => s.system === 'snomed')).toMatchObject({ available: false });
    expect(neither.find((s) => s.system === 'snomed')?.reason).toContain('SNOMED_FHIR_URL');

    const serverOnly = await harness({ snomedUrl: 'https://tx.example' }).svc.systemsForTenant(TENANT);
    expect(serverOnly.find((s) => s.system === 'snomed')).toMatchObject({ available: false });
    expect(serverOnly.find((s) => s.system === 'snomed')?.reason).toContain('member-country licensed');

    const both = await harness({ snomedUrl: 'https://tx.example', snomedEnabled: true }).svc.systemsForTenant(TENANT);
    expect(both.find((s) => s.system === 'snomed')).toMatchObject({ available: true });
  });
});

describe('searchIcd10', () => {
  it('finds by title token and by exact dotted/undotted-style code', async () => {
    const { svc } = harness();
    expect((await svc.searchIcd10('diabetes'))[0]).toMatchObject({ code: 'E11' });
    expect(await svc.searchIcd10('I10')).toEqual([
      { code: 'I10', display: 'Essential (primary) hypertension' },
    ]);
  });
});

describe('searchSnomed — FHIR $expand client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('expands the implicit SNOMED ValueSet with the text filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          expansion: { contains: [{ code: '38341003', display: 'Hypertensive disorder' }] },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { svc } = harness({ snomedUrl: 'https://tx.example/fhir' });
    const results = await svc.searchSnomed('hypertension');

    expect(results).toEqual([{ code: '38341003', display: 'Hypertensive disorder' }]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('https://tx.example/fhir/ValueSet/$expand');
    expect(url).toContain(encodeURIComponent('http://snomed.info/sct?fhir_vs'));
    expect(url).toContain('filter=hypertension');
  });

  it('degrades to empty on server errors — a down tx server must not break the dictionary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { svc } = harness({ snomedUrl: 'https://tx.example/fhir' });
    expect(await svc.searchSnomed('anything')).toEqual([]);
  });
});

describe('option-level SNOMED suggestions', () => {
  afterEach(() => vi.unstubAllGlobals());

  function suggestHarness(snomedEnabled: boolean) {
    const uiSchema = {
      layout: {
        type: 'VerticalLayout',
        elements: [
          { type: 'Control', scope: '#/properties/avpu', label: 'AVPU' },
        ],
      },
    };
    const dataSchema = {
      type: 'object',
      properties: {
        avpu: {
          type: 'string',
          oneOf: [
            { const: 'ALERT', title: 'Alert' },
            { const: 'VERBAL', title: 'Verbal' },
          ],
        },
      },
    };
    const version = { id: 'v1', version: 1, publishedAt: null, uiSchema, dataSchema };
    const versionWrites: Array<Record<string, unknown>> = [];

    const prisma = {
      loincCode: {
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      icd10Code: { count: vi.fn().mockResolvedValue(0) },
      tenant: { findUnique: vi.fn().mockResolvedValue({ settings: { snomedEnabled } }) },
      form: { findFirst: vi.fn().mockResolvedValue({ id: FORM_ID, versions: [version] }) },
      formVersion: {
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          versionWrites.push(data);
          return Promise.resolve({ id: 'v1' });
        }),
      },
    };
    const config = {
      get: vi.fn().mockImplementation((k: string) => (k === 'SNOMED_FHIR_URL' ? 'https://tx.example' : undefined)),
    };
    // The tx server offers one candidate per option.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            expansion: { contains: [{ code: '248234008', display: 'Mentally alert' }] },
          }),
      }),
    );
    const generate = vi.fn().mockResolvedValue(
      JSON.stringify({
        selections: [
          { key: '#/properties/avpu::ALERT', code: '248234008', confidence: 0.9 },
          { key: '#/properties/avpu::VERBAL', code: null, confidence: 0 },
        ],
      }),
    );
    const provider = { name: 'p', generate };
    const terminology = new TerminologyService(prisma as never, config as never);
    const svc = new CodingSuggestService(
      prisma as never,
      { record: vi.fn() } as never,
      {
        getProvidersForTenant: vi.fn().mockResolvedValue({}),
        getProvider: vi.fn().mockReturnValue(provider),
      } as never,
      { meter: vi.fn().mockReturnValue(provider) } as never,
      terminology,
    );
    return { svc, versionWrites, generate };
  }

  it('suggests SNOMED for enum options when the gate is open, writing optionCoding', async () => {
    const { svc, versionWrites } = suggestHarness(true);

    const result = await svc.suggestForForm(TENANT, FORM_ID, {});

    expect(result.suggested).toBe(1);
    const written = JSON.stringify(versionWrites[0]);
    expect(written).toContain('"optionCoding"');
    expect(written).toContain('"code":"248234008"');
    expect(written).toContain('http://snomed.info/sct');
  });

  it('skips options entirely when the tenant gate is closed', async () => {
    const { svc, generate } = suggestHarness(false);

    const result = await svc.suggestForForm(TENANT, FORM_ID, {});

    // No LOINC candidates and no SNOMED targets -> nothing to ask the model.
    expect(result.suggested).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });
});
