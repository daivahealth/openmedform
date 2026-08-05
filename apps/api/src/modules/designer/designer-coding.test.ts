import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { DesignerService } from './designer.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';
const USER = '10000000-0000-0000-0000-000000000001';

const LOINC = {
  system: 'http://loinc.org',
  code: '59408-5',
  display: 'Oxygen saturation',
  source: 'human' as const,
  verified: true,
};

const uiSchema = () => ({
  layout: {
    type: 'Group',
    label: 'Vitals',
    elements: [
      { type: 'Control', scope: '#/properties/spo2' },
      {
        type: 'Control',
        scope: '#/properties/avpu',
        options: { omf: { optionCoding: { ALERT: [{ ...LOINC, verified: false }] } } },
      },
    ],
  },
});

function harness(options?: { formExists?: boolean; publishedAt?: Date | null }) {
  const version = {
    id: 'v1',
    version: 3,
    publishedAt: options?.publishedAt ?? null,
    dataSchema: { type: 'object' },
    uiSchema: uiSchema(),
    printSchema: {},
    translations: {},
    conversionMetadata: {},
    scoringRules: {},
  };
  const versionWrites: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];

  const prisma = {
    form: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          (options?.formExists ?? true) ? { id: FORM_ID, versions: [version] } : null,
        ),
      update: vi.fn().mockResolvedValue({}),
    },
    formVersion: {
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        versionWrites.push(data);
        return Promise.resolve({ id: 'v1', version: 3 });
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        versionWrites.push(data);
        return Promise.resolve({ id: 'v2', version: 4 });
      }),
    },
    formAiMessage: { create: vi.fn().mockResolvedValue({}) },
  };
  const svc = new DesignerService(
    prisma as never,
    { record: vi.fn().mockImplementation((row: Record<string, unknown>) => audits.push(row)) } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, prisma, versionWrites, audits, version };
}

const writtenControl = (write: Record<string, unknown>, scope: string) => {
  const layout = (write.uiSchema as { layout: { elements: Array<Record<string, unknown>> } }).layout;
  return layout.elements.find((e) => e.scope === scope)!;
};

describe('updateCoding', () => {
  it('binds a field on a draft in place, audited with the human who clicked', async () => {
    const { svc, versionWrites, audits, prisma } = harness();

    const result = await svc.updateCoding(
      TENANT,
      FORM_ID,
      { scope: '#/properties/spo2', coding: [LOINC] },
      '127.0.0.1',
      USER,
    );

    expect(prisma.formVersion.update).toHaveBeenCalled();
    const control = writtenControl(versionWrites[0], '#/properties/spo2');
    expect((control.options as { omf: { coding: unknown } }).omf.coding).toEqual([LOINC]);
    expect(result.version).toBe(3);
    expect(audits[0]).toMatchObject({
      action: 'form.coding.update',
      userId: USER,
      details: expect.objectContaining({
        scope: '#/properties/spo2',
        codes: ['http://loinc.org|59408-5|verified'],
      }),
    });
  });

  it('approves an option binding (replace with verified:true) without touching siblings', async () => {
    const { svc, versionWrites } = harness();

    await svc.updateCoding(
      TENANT,
      FORM_ID,
      { scope: '#/properties/avpu', optionCode: 'ALERT', coding: [LOINC] },
      null,
      USER,
    );

    const control = writtenControl(versionWrites[0], '#/properties/avpu');
    const omf = (control.options as { omf: Record<string, unknown> }).omf;
    expect((omf.optionCoding as Record<string, unknown>).ALERT).toEqual([LOINC]);
  });

  it('clears a binding with an empty list and prunes the empty containers', async () => {
    const { svc, versionWrites } = harness();

    await svc.updateCoding(
      TENANT,
      FORM_ID,
      { scope: '#/properties/avpu', optionCode: 'ALERT', coding: [] },
      null,
      USER,
    );

    const control = writtenControl(versionWrites[0], '#/properties/avpu');
    const omf = (control.options as { omf: Record<string, unknown> }).omf;
    expect(omf.optionCoding).toBeUndefined();
  });

  it('forks a new draft when the latest version is published', async () => {
    const { svc, prisma, versionWrites } = harness({ publishedAt: new Date() });

    const result = await svc.updateCoding(
      TENANT,
      FORM_ID,
      { scope: '#/properties/spo2', coding: [LOINC] },
      null,
      USER,
    );

    expect(prisma.formVersion.create).toHaveBeenCalled();
    expect(prisma.formVersion.update).not.toHaveBeenCalled();
    expect(result.version).toBe(4);
    // The fork carries every artifact forward, not just the uiSchema.
    expect(versionWrites[0]).toHaveProperty('dataSchema');
    expect(versionWrites[0]).toHaveProperty('scoringRules');
  });

  it('refuses an unknown scope and a foreign tenant, writing nothing', async () => {
    const { svc, versionWrites } = harness();
    await expect(
      svc.updateCoding(TENANT, FORM_ID, { scope: '#/properties/ghost', coding: [] }, null, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(versionWrites).toHaveLength(0);

    const { svc: foreign } = harness({ formExists: false });
    await expect(
      foreign.updateCoding(TENANT, FORM_ID, { scope: '#/properties/spo2', coding: [] }, null, USER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
