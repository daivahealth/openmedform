import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { DesignerService } from './designer.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';
const USER = '10000000-0000-0000-0000-000000000001';

const assembled = {
  dataSchema: { type: 'object', properties: {} },
  uiSchema: { layout: { type: 'VerticalLayout', elements: [] } },
  printSchema: {},
  translations: {},
  conversionMetadata: {},
  scoringRules: {},
  warnings: [] as unknown[],
};

function harness(options?: { formExists?: boolean; publishedAt?: Date | null; chatWriteFails?: boolean }) {
  const formExists = options?.formExists ?? true;
  const version = { id: 'v1', version: 1, publishedAt: options?.publishedAt ?? null, ...assembled };
  /** Every formAiMessage.create payload, in call order. */
  const chatRows: Array<Record<string, unknown>> = [];

  const prisma = {
    form: {
      findFirst: vi
        .fn()
        .mockResolvedValue(formExists ? { id: FORM_ID, name: 'F', versions: [version] } : null),
      update: vi.fn().mockResolvedValue({}),
    },
    formVersion: {
      create: vi.fn().mockResolvedValue({ id: 'v2', version: 2 }),
      update: vi.fn().mockResolvedValue({ id: 'v1', version: 1 }),
    },
    formAiMessage: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        if (options?.chatWriteFails) return Promise.reject(new Error('db down'));
        chatRows.push(data);
        return Promise.resolve({ id: 'm', ...data });
      }),
      findMany: vi.fn().mockResolvedValue([{ id: 'm1', role: 'USER', content: 'hi' }]),
    },
  };
  const provider = { name: 'p', generate: vi.fn().mockResolvedValue('{}') };
  const svc = new DesignerService(
    prisma as never,
    { record: vi.fn() } as never,
    {
      getProvidersForTenant: vi.fn().mockResolvedValue({}),
      getProvider: vi.fn().mockReturnValue(provider),
    } as never,
    { meter: vi.fn().mockReturnValue(provider) } as never,
    { assemble: vi.fn().mockReturnValue(assembled) } as never,
  );
  return { svc, prisma, chatRows };
}

describe('refine chat transcript', () => {
  it('records the instruction and the applied outcome as one exchange', async () => {
    const { svc, chatRows } = harness();

    await svc.refine(TENANT, FORM_ID, 'make the Morse fields dropdowns', undefined, () => {}, null, USER);

    expect(chatRows.map((r) => r.role)).toEqual(['USER', 'ASSISTANT']);
    expect(chatRows[0]).toMatchObject({
      content: 'make the Morse fields dropdowns',
      status: 'OK',
      hadImage: false,
      createdById: USER,
      tenantId: TENANT,
      formId: FORM_ID,
    });
    expect(chatRows[1].content).toBe('Applied to draft version 1.');
  });

  it('says when the refinement forked a published version and carries warnings', async () => {
    const { svc, chatRows } = harness({ publishedAt: new Date() });
    assembled.warnings = [{ type: 'W' }];

    try {
      await svc.refine(TENANT, FORM_ID, 'x', undefined, () => {}, null, USER);
    } finally {
      assembled.warnings = [];
    }

    expect(chatRows[1].content).toBe(
      'Applied to draft version 2 (forked from the published version), with 1 warning to review.',
    );
  });

  it('writes nothing at all for a form the tenant does not own', async () => {
    const { svc, chatRows } = harness({ formExists: false });

    await expect(
      svc.refine(TENANT, FORM_ID, 'x', undefined, () => {}, null, USER),
    ).rejects.toBeInstanceOf(NotFoundException);
    await svc.recordFailure(TENANT, FORM_ID, 'boom', USER);

    expect(chatRows).toHaveLength(0);
  });

  it('recordFailure writes an ERROR assistant row with the user-safe text', async () => {
    const { svc, chatRows } = harness();

    await svc.recordFailure(TENANT, FORM_ID, 'Refinement failed. Nothing was changed.', USER);

    expect(chatRows).toEqual([
      expect.objectContaining({
        role: 'ASSISTANT',
        status: 'ERROR',
        content: 'Refinement failed. Nothing was changed.',
      }),
    ]);
  });

  it('a lost chat write never fails the refinement itself', async () => {
    const { svc, prisma } = harness({ chatWriteFails: true });

    await expect(
      svc.refine(TENANT, FORM_ID, 'x', undefined, () => {}, null, USER),
    ).resolves.toMatchObject({ version: 1 });
    expect(prisma.formVersion.update).toHaveBeenCalled();
  });

  it('listMessages is tenant-scoped and reads oldest-first with a bound', async () => {
    const { svc, prisma } = harness();

    await svc.listMessages(TENANT, FORM_ID);
    expect(prisma.formAiMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, formId: FORM_ID },
        orderBy: { createdAt: 'asc' },
        take: -400,
      }),
    );

    const { svc: foreign } = harness({ formExists: false });
    await expect(foreign.listMessages(TENANT, FORM_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
