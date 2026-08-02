import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { FormService } from './form.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';
const actor = { userId: '10000000-0000-0000-0000-000000000001', ipAddress: '127.0.0.1' };

function setup(form: Record<string, unknown>) {
  const prisma = {
    form: {
      findFirst: vi.fn().mockResolvedValue(form),
      update: vi.fn().mockImplementation(({ data }) => ({ ...form, ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const audit = { record: vi.fn() };
  const service = new FormService(
    prisma as never,
    audit as never,
    {} as never,
    { assertFormLimit: vi.fn() } as never,
  );
  return { service, prisma, audit };
}

const published = { id: FORM_ID, name: 'VTE', status: 'PUBLISHED', statusBeforeArchive: null };

describe('archiving a form', () => {
  it('records when it happened and what to restore', async () => {
    const { service, prisma } = setup({ ...published, status: 'REVIEW' });

    await service.archive(TENANT, FORM_ID, actor);

    const data = prisma.form.update.mock.calls[0][0].data;
    expect(data.status).toBe('ARCHIVED');
    expect(data.statusBeforeArchive).toBe('REVIEW');
    expect(data.archivedAt).toBeInstanceOf(Date);
  });

  it('is audited — archiving is how a form disappears, so it needs a trail', async () => {
    const { service, audit } = setup(published);

    await service.archive(TENANT, FORM_ID, actor);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'form.archive',
        details: expect.objectContaining({ previousStatus: 'PUBLISHED' }),
      }),
    );
  });

  it('is idempotent', async () => {
    const { service, prisma } = setup({ ...published, status: 'ARCHIVED' });

    await service.archive(TENANT, FORM_ID, actor);

    expect(prisma.form.update).not.toHaveBeenCalled();
  });
});

describe('unarchiving', () => {
  it('restores the exact status it had, not a guess', async () => {
    // A form archived while awaiting review must come back to REVIEW.
    const { service, prisma } = setup({
      ...published,
      status: 'ARCHIVED',
      statusBeforeArchive: 'REVIEW',
    });

    await service.unarchive(TENANT, FORM_ID, actor);

    expect(prisma.form.update.mock.calls[0][0].data).toEqual({
      status: 'REVIEW',
      archivedAt: null,
      statusBeforeArchive: null,
    });
  });

  it('falls back to DRAFT when no status was recorded', async () => {
    // Forms archived before this existed. DRAFT is the safe default —
    // guessing PUBLISHED could silently put a form back in front of clinicians.
    const { service, prisma } = setup({
      ...published,
      status: 'ARCHIVED',
      statusBeforeArchive: null,
    });

    await service.unarchive(TENANT, FORM_ID, actor);

    expect(prisma.form.update.mock.calls[0][0].data.status).toBe('DRAFT');
  });

  it('refuses a form that is not archived', async () => {
    const { service } = setup(published);
    await expect(service.unarchive(TENANT, FORM_ID, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is audited with what it was restored to', async () => {
    const { service, audit } = setup({
      ...published,
      status: 'ARCHIVED',
      statusBeforeArchive: 'PUBLISHED',
    });

    await service.unarchive(TENANT, FORM_ID, actor);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'form.unarchive',
        details: expect.objectContaining({ restoredTo: 'PUBLISHED' }),
      }),
    );
  });
});

describe('archived forms leave the list', () => {
  it('are excluded by default', async () => {
    const { service, prisma } = setup(published);
    await service.findAll(TENANT);
    expect(prisma.form.findMany.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      status: { not: 'ARCHIVED' },
    });
  });

  it('are included on request, so they can be restored', async () => {
    const { service, prisma } = setup(published);
    await service.findAll(TENANT, true);
    expect(prisma.form.findMany.mock.calls[0][0].where).toEqual({ tenantId: TENANT });
  });

  it('are excluded from the count too', async () => {
    const { service, prisma } = setup(published);
    await service.count(TENANT);
    expect(prisma.form.count.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      status: { not: 'ARCHIVED' },
    });
  });
});
