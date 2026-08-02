import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { AuthService } from './auth.service';

const USER_ID = '10000000-0000-0000-0000-000000000001';
const TENANT_ID = '20000000-0000-0000-0000-000000000002';

const activeUser = {
  id: USER_ID,
  tenantId: TENANT_ID,
  email: 'u@example.com',
  role: 'CLINICIAN',
  isActive: true,
  tenant: { id: TENANT_ID, isActive: true },
};

function setup(opts: { claimed?: number; user?: unknown } = {}) {
  const prisma = {
    authExchangeCode: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
      findUnique: vi.fn().mockResolvedValue({ userId: USER_ID }),
    },
    user: {
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(opts.user === undefined ? activeUser : opts.user),
    },
  };
  const jwt = { sign: vi.fn().mockReturnValue('signed.jwt.value') };
  const service = new AuthService(prisma as never, jwt as never, { record: vi.fn() } as never);
  return { service, prisma, jwt };
}

describe('createExchangeCode', () => {
  it('stores only a hash — the plaintext lives in the redirect URL alone', async () => {
    const { service, prisma } = setup();

    const code = await service.createExchangeCode(USER_ID);

    const stored = prisma.authExchangeCode.create.mock.calls[0][0].data;
    expect(stored.codeHash).toBe(createHash('sha256').update(code).digest('hex'));
    expect(stored.codeHash).not.toContain(code);
    expect(code.length).toBeGreaterThan(32);
  });

  it('issues a different code every time', async () => {
    const { service } = setup();
    expect(await service.createExchangeCode(USER_ID)).not.toBe(
      await service.createExchangeCode(USER_ID),
    );
  });

  it('expires the code in about a minute', async () => {
    const { service, prisma } = setup();

    await service.createExchangeCode(USER_ID);

    const { expiresAt } = prisma.authExchangeCode.create.mock.calls[0][0].data;
    const ttl = expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(30_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});

describe('exchangeCode', () => {
  it('claims the code atomically, in the same query that checks it', async () => {
    // A read-then-write would let two simultaneous requests both win. The
    // filter carries usedAt: null so the database decides the winner.
    const { service, prisma } = setup();

    await service.exchangeCode('some-code');

    const where = prisma.authExchangeCode.updateMany.mock.calls[0][0].where;
    expect(where.usedAt).toBeNull();
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(prisma.authExchangeCode.updateMany.mock.calls[0][0].data.usedAt).toBeInstanceOf(Date);
  });

  it('returns a session for a valid code', async () => {
    const { service } = setup();
    const session = await service.exchangeCode('some-code');
    expect(session.accessToken).toBe('signed.jwt.value');
  });

  it('rejects a code that was already spent', async () => {
    // updateMany matches nothing the second time, because usedAt is set.
    const { service } = setup({ claimed: 0 });
    await expect(service.exchangeCode('same-code')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('gives the same message for expired, spent and unknown codes', async () => {
    // Distinguishing them would tell an attacker which codes are real.
    const { service } = setup({ claimed: 0 });
    await expect(service.exchangeCode('nope')).rejects.toThrow(/expired/i);
  });

  it('refuses once the user has been deactivated', async () => {
    const { service } = setup({ user: null });
    await expect(service.exchangeCode('some-code')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses when the tenant has been deactivated', async () => {
    const { service } = setup({ user: { ...activeUser, tenant: { isActive: false } } });
    await expect(service.exchangeCode('some-code')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
