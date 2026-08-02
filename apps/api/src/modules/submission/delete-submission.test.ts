import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';

import { SubmissionService } from './submission.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const OWNER = '10000000-0000-0000-0000-000000000001';
const OTHER = '10000000-0000-0000-0000-00000000000b';
const SUB_ID = '50000000-0000-0000-0000-000000000005';

const record = (over: Record<string, unknown> = {}) => ({
  id: SUB_ID,
  tenantId: TENANT,
  formId: '30000000-0000-0000-0000-000000000003',
  submittedById: OWNER,
  status: 'COMPLETED',
  patientMrn: 'MRN-1',
  encounterId: 'ENC-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  signedAt: null,
  form: { name: 'VTE Assessment' },
  ...over,
});

function setup(existing = record()) {
  const prisma = {
    submission: {
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockImplementation(({ data }) => ({ ...existing, ...data })),
      delete: vi.fn().mockResolvedValue(existing),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const audit = { record: vi.fn() };
  const service = new SubmissionService(
    prisma as never,
    {} as never,
    audit as never,
    {} as never,
  );
  return { service, prisma, audit };
}

const asOwner = { userId: OWNER, role: 'CLINICIAN', ipAddress: '127.0.0.1' };
const asStranger = { userId: OTHER, role: 'CLINICIAN', ipAddress: '127.0.0.1' };
const asAdmin = { userId: OTHER, role: 'TENANT_ADMIN', ipAddress: '127.0.0.1' };

describe('void — how "delete" behaves for a clinical record', () => {
  it('retracts rather than destroys', async () => {
    const { service, prisma } = setup();

    await service.voidSubmission(TENANT, SUB_ID, asOwner);

    expect(prisma.submission.update).toHaveBeenCalledWith({
      where: { id: SUB_ID },
      data: { status: 'VOIDED' },
    });
    expect(prisma.submission.delete).not.toHaveBeenCalled();
  });

  it('records the status it came from, so the void can be understood later', async () => {
    const { service, audit } = setup(record({ status: 'SIGNED' }));

    await service.voidSubmission(TENANT, SUB_ID, asOwner);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'submission.void',
        details: expect.objectContaining({ previousStatus: 'SIGNED' }),
      }),
    );
  });

  it('is idempotent — a double click is not a failure', async () => {
    const { service, prisma } = setup(record({ status: 'VOIDED' }));

    await expect(service.voidSubmission(TENANT, SUB_ID, asOwner)).resolves.toBeDefined();
    expect(prisma.submission.update).not.toHaveBeenCalled();
  });

  it('lets an admin void a record they did not submit', async () => {
    const { service, prisma } = setup();
    await service.voidSubmission(TENANT, SUB_ID, asAdmin);
    expect(prisma.submission.update).toHaveBeenCalled();
  });

  it("refuses to let a user void someone else's", async () => {
    const { service } = setup();
    await expect(service.voidSubmission(TENANT, SUB_ID, asStranger)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('permanent delete', () => {
  it('is refused for a non-admin, even on their own record', async () => {
    // Unrecoverable, so ownership is not enough.
    const { service, prisma } = setup();

    await expect(service.removePermanently(TENANT, SUB_ID, asOwner)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.submission.delete).not.toHaveBeenCalled();
  });

  it('points the user at voiding instead', async () => {
    const { service } = setup();
    await expect(service.removePermanently(TENANT, SUB_ID, asOwner)).rejects.toThrow(/void it/i);
  });

  it('destroys the row for an admin', async () => {
    const { service, prisma } = setup();

    await service.removePermanently(TENANT, SUB_ID, asAdmin);

    expect(prisma.submission.delete).toHaveBeenCalledWith({ where: { id: SUB_ID } });
  });

  it('audits BEFORE deleting, with enough detail to know what was destroyed', async () => {
    // Once the row is gone the audit entry is the only remaining trace, so it
    // has to be written first and it has to be complete.
    const { service, audit, prisma } = setup(record({ status: 'SIGNED', signedAt: new Date() }));
    const order: string[] = [];
    audit.record.mockImplementation(() => void order.push('audit'));
    prisma.submission.delete.mockImplementation(() => {
      order.push('delete');
      return Promise.resolve(record());
    });

    await service.removePermanently(TENANT, SUB_ID, asAdmin);

    expect(order).toEqual(['audit', 'delete']);
    const details = audit.record.mock.calls[0][0].details;
    expect(details).toMatchObject({
      formName: 'VTE Assessment',
      status: 'SIGNED',
      patientMrn: 'MRN-1',
      encounterId: 'ENC-1',
      submittedById: OWNER,
    });
    expect(details.signedAt).toBeTruthy();
  });
});

describe('voided records leave the list', () => {
  it('excludes them by default', async () => {
    const { service, prisma } = setup();
    await service.findAll(TENANT);
    expect(prisma.submission.findMany.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      status: { not: 'VOIDED' },
    });
  });

  it('includes them on request, for audit', async () => {
    const { service, prisma } = setup();
    await service.findAll(TENANT, true);
    expect(prisma.submission.findMany.mock.calls[0][0].where).toEqual({ tenantId: TENANT });
  });

  it('counts the same set the list shows', async () => {
    // Otherwise the dashboard total and the visible rows disagree.
    const { service, prisma } = setup();
    await service.count(TENANT);
    expect(prisma.submission.count.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      status: { not: 'VOIDED' },
    });
  });
});
