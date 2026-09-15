import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { DesignerService } from './designer.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';
const USER = '10000000-0000-0000-0000-000000000001';

const uiSchema = () => ({
  layout: {
    type: 'VerticalLayout',
    elements: [
      {
        type: 'Group',
        label: 'Observations',
        options: { omf: { accentColor: '#1e8e5a' } },
        elements: [
          { type: 'Control', scope: '#/properties/hr', options: { omf: { unit: '/min' } } },
          { type: 'Control', scope: '#/properties/note', options: { omf: { control: 'textarea' } } },
        ],
      },
      { type: 'Control', scope: '#/properties/ward' },
    ],
  },
});

function harness(publishedAt: Date | null = null) {
  const version = {
    id: 'v1',
    version: 3,
    publishedAt,
    dataSchema: { type: 'object' },
    uiSchema: uiSchema(),
    printSchema: {},
    translations: {},
    conversionMetadata: {},
    scoringRules: {},
  };
  const writes: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const prisma = {
    form: {
      findFirst: vi.fn().mockResolvedValue({ id: FORM_ID, versions: [version] }),
      update: vi.fn().mockResolvedValue({}),
    },
    formVersion: {
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return Promise.resolve({ id: 'v1', version: 3 });
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return Promise.resolve({ id: 'v2', version: 4 });
      }),
    },
  };
  const svc = new DesignerService(
    prisma as never,
    { record: vi.fn().mockImplementation((row: Record<string, unknown>) => audits.push(row)) } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, prisma, writes, audits };
}

const layoutOf = (write: Record<string, unknown>) =>
  (write.uiSchema as { layout: Record<string, unknown> }).layout;
const omfOf = (el: Record<string, unknown>) =>
  ((el.options as Record<string, unknown> | undefined)?.omf ?? {}) as Record<string, unknown>;

describe('updateFieldMeta (ADR-006)', () => {
  it('sets history on a Group by pointer, keeping its other omf keys', async () => {
    const { svc, writes, audits, prisma } = harness();
    await svc.updateFieldMeta(
      TENANT,
      FORM_ID,
      { target: { pointer: '/elements/0' }, history: { show: 'inline', count: 8 } },
      '127.0.0.1',
      USER,
    );
    expect(prisma.formVersion.update).toHaveBeenCalled();
    const group = (layoutOf(writes[0]).elements as Array<Record<string, unknown>>)[0];
    expect(omfOf(group)).toEqual({ accentColor: '#1e8e5a', history: { show: 'inline', count: 8 } });
    expect(audits[0]).toMatchObject({
      action: 'form.field-meta.update',
      userId: USER,
      details: expect.objectContaining({ target: { pointer: '/elements/0' }, history: { show: 'inline', count: 8 } }),
    });
  });

  it('overrides on a field by scope and sets its unit', async () => {
    const { svc, writes } = harness();
    await svc.updateFieldMeta(
      TENANT,
      FORM_ID,
      { target: { scope: '#/properties/note' }, history: { show: 'none' } },
      null,
      USER,
    );
    await svc.updateFieldMeta(TENANT, FORM_ID, { target: { scope: '#/properties/hr' }, unit: 'bpm' }, null, USER);
    const group0 = (layoutOf(writes[0]).elements as Array<Record<string, unknown>>)[0];
    const note = (group0.elements as Array<Record<string, unknown>>)[1];
    expect(omfOf(note)).toEqual({ control: 'textarea', history: { show: 'none' } });
    const group1 = (layoutOf(writes[1]).elements as Array<Record<string, unknown>>)[0];
    const hr = (group1.elements as Array<Record<string, unknown>>)[0];
    expect(omfOf(hr).unit).toBe('bpm');
  });

  it('clears with null and prunes empty option bags', async () => {
    const { svc, writes } = harness();
    await svc.updateFieldMeta(TENANT, FORM_ID, { target: { scope: '#/properties/hr' }, unit: null }, null, USER);
    const hr = ((layoutOf(writes[0]).elements as Array<Record<string, unknown>>)[0].elements as Array<Record<string, unknown>>)[0];
    expect(hr.options).toBeUndefined();
  });

  it('refuses a unit on a section, and an unknown target', async () => {
    const { svc } = harness();
    await expect(
      svc.updateFieldMeta(TENANT, FORM_ID, { target: { pointer: '/elements/0' }, unit: 'kg' }, null, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.updateFieldMeta(TENANT, FORM_ID, { target: { pointer: '/elements/9' }, history: null }, null, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.updateFieldMeta(TENANT, FORM_ID, { target: { scope: '#/properties/nope' }, history: null }, null, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forks a new draft when the latest version is published', async () => {
    const { svc, prisma, audits } = harness(new Date('2026-09-01T00:00:00Z'));
    const result = await svc.updateFieldMeta(
      TENANT,
      FORM_ID,
      { target: { pointer: '/elements/0' }, history: { show: 'popover' } },
      null,
      USER,
    );
    expect(prisma.formVersion.create).toHaveBeenCalled();
    expect(result.version).toBe(4);
    expect(audits[0].details).toMatchObject({ forkedNewDraft: true });
  });
});
