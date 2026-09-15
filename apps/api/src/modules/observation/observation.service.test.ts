import { describe, expect, it, vi } from 'vitest';

import { ObservationService } from './observation.service';
import { VITALS_V2 } from '../../../../../packages/form-core/src/observation/fixtures.test-helpers';

const TENANT = '20000000-0000-0000-0000-000000000002';
const SUB = '50000000-0000-0000-0000-000000000005';

function setup() {
  const prisma = {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    observation: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    form: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { prisma, service: new ObservationService(prisma as never) };
}

const submission = (over: Record<string, unknown> = {}) => ({
  id: SUB,
  tenantId: TENANT,
  formId: '30000000-0000-0000-0000-000000000003',
  formVersionId: '40000000-0000-0000-0000-000000000004',
  patientMrn: 'MRN-1',
  encounterId: 'ENC-1',
  data: { vitals: { pulse: 88, spo2: 97, avpu: 'ALERT' } },
  effectiveAt: null,
  createdAt: new Date('2026-09-15T14:20:00Z'),
  submittedBy: { fullName: 'RN Priya' },
  formVersion: { ...VITALS_V2, version: 2 },
  ...over,
});

describe('resolveEffectiveAt', () => {
  it('prefers the explicit value, then the flagged field, then createdAt', () => {
    const { service } = setup();
    expect(service.resolveEffectiveAt(submission({ effectiveAt: new Date('2026-09-15T14:00:00Z') }))).toEqual(
      new Date('2026-09-15T14:00:00Z'),
    );
    const flagged = {
      dataSchema: { type: 'object', properties: { takenAt: { type: 'string' }, hr: { type: 'number' } } },
      uiSchema: {
        layout: {
          type: 'VerticalLayout',
          elements: [{ type: 'Control', scope: '#/properties/takenAt', options: { omf: { effectiveAt: true } } }],
        },
      },
    };
    expect(
      service.resolveEffectiveAt(submission({ formVersion: flagged, data: { takenAt: '2026-09-15T13:00:00Z' } })),
    ).toEqual(new Date('2026-09-15T13:00:00Z'));
    expect(service.resolveEffectiveAt(submission())).toEqual(new Date('2026-09-15T14:20:00Z'));
  });
});

describe('replaceForSubmission', () => {
  it('deletes the old rows and inserts one indexed row per reading, with the full Observation as `row`', async () => {
    const { service, prisma } = setup();
    const rows = await service.replaceForSubmission(submission({ effectiveAt: new Date('2026-09-15T14:00:00Z') }));

    expect(rows.map((r) => r.path)).toEqual(['vitals.pulse', 'vitals.spo2', 'vitals.avpu']);
    expect(prisma.observation.deleteMany).toHaveBeenCalledWith({ where: { submissionId: SUB, tenantId: TENANT } });
    const created = prisma.observation.createMany.mock.calls[0][0].data;
    expect(created[0]).toMatchObject({
      tenantId: TENANT,
      submissionId: SUB,
      patientMrn: 'MRN-1',
      path: 'vitals.pulse',
      codeSystem: 'http://loinc.org',
      code: '8867-4',
      label: 'Pulse',
      valueNum: 88,
      valueText: null,
      unit: '/min',
      effectiveAt: new Date('2026-09-15T14:00:00Z'),
    });
    expect(created[0].row).toMatchObject({
      value: 88,
      source: { submissionId: SUB, formVersion: 2, author: 'RN Priya' },
    });
    // Unbound SpO2: no code columns; coded answer: text value, option label in the row.
    expect(created[1]).toMatchObject({ code: null, valueNum: 97 });
    expect(created[2]).toMatchObject({ valueText: 'ALERT' });
    expect(created[2].row).toMatchObject({ valueLabel: 'Alert' });
  });

  it('writes nothing for an empty response but still clears stale rows', async () => {
    const { service, prisma } = setup();
    await service.replaceForSubmission(submission({ data: {} }));
    expect(prisma.observation.deleteMany).toHaveBeenCalled();
    expect(prisma.observation.createMany).not.toHaveBeenCalled();
  });
});

describe('forPatient', () => {
  it('queries by code (any system unless given), tenant-scoped, newest first, voided excluded', async () => {
    const { service, prisma } = setup();
    prisma.observation.findMany.mockResolvedValue([{ row: { path: 'x', value: 1 }, path: 'x' }]);
    const out = await service.forPatient(TENANT, 'MRN-1', { code: '8867-4', limit: 3 });
    expect(out).toEqual([{ path: 'x', value: 1 }]);
    const args = prisma.observation.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: TENANT, patientMrn: 'MRN-1', code: '8867-4', submission: { status: { not: 'VOIDED' } } });
    expect(args.where.codeSystem).toBeUndefined();
    expect(args.orderBy[0]).toEqual({ effectiveAt: 'desc' });
    expect(args.take).toBe(3);
  });

  it('a path query matches stored paths that carry record indices', async () => {
    const { service, prisma } = setup();
    prisma.observation.findMany
      .mockResolvedValueOnce([
        { row: { path: 'hourly.2.hr' }, path: 'hourly.2.hr' },
        { row: { path: 'hourly.0.position' }, path: 'hourly.0.position' },
        { row: { path: 'hourly.0.hr' }, path: 'hourly.0.hr' },
      ]);
    const out = await service.forPatient(TENANT, 'MRN-1', { path: 'hourly.hr', limit: 5 });
    expect(out.map((o) => o.path)).toEqual(['hourly.2.hr', 'hourly.0.hr']);
    expect(prisma.observation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.observation.findMany.mock.calls[0][0].where.path).toEqual({ startsWith: 'hourly' });
  });

  it('clamps the limit', async () => {
    const { service, prisma } = setup();
    await service.forPatient(TENANT, 'MRN-1', { code: 'x', limit: 99999 });
    expect(prisma.observation.findMany.mock.calls[0][0].take).toBe(500);
  });
});
