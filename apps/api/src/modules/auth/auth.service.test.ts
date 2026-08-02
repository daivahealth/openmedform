import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Focused coverage for the Google login/signup resolver — the branch that
 * cannot be exercised against a live server without Google credentials.
 */
describe('AuthService.resolveSsoUser', () => {
  let prisma: any;
  let audit: any;
  let service: AuthService;

  const signup = { organizationName: 'Acme Health', country: 'India' };

  const activeUser = (over: Record<string, unknown> = {}) => ({
    id: 'u1',
    email: 'jane@acme.com',
    tenantId: 't1',
    role: 'TENANT_ADMIN',
    tenant: { id: 't1', isActive: true },
    ...over,
  });

  beforeEach(() => {
    prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (fn: any) =>
        fn({
          tenant: { create: vi.fn().mockResolvedValue({ id: 't-new' }) },
          user: {
            create: vi.fn().mockResolvedValue({
              id: 'u-new',
              email: 'new@acme.com',
              tenantId: 't-new',
              role: 'TENANT_ADMIN',
              tenant: { id: 't-new', isActive: true },
            }),
          },
        }),
      ),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new AuthService(prisma, {} as any, audit);
  });

  it('signs in an existing single active account (login intent)', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser()]);
    const result = await service.resolveSsoUser('google', 'jane@acme.com', 'Jane', 'login');
    expect(result.id).toBe('u1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown email on login intent (invite-only)', async () => {
    await expect(
      service.resolveSsoUser('google', 'nobody@acme.com', 'Nobody', 'login'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('provisions a new tenant + admin on signup intent for an unknown email', async () => {
    const result = await service.resolveSsoUser('google', 'new@acme.com', 'New Person', 'signup', signup);
    expect(result.id).toBe('u-new');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.register',
        details: expect.objectContaining({
          method: 'google',
          organizationName: 'Acme Health',
          country: 'India',
        }),
      }),
    );
  });

  it('rejects signup without organization and country', async () => {
    await expect(
      service.resolveSsoUser('google', 'new@acme.com', 'New Person', 'signup'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores the requested organization name and country on the new tenant', async () => {
    let created: { name?: string; country?: string } = {};
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tenant: {
          create: vi.fn(async ({ data }: any) => {
            created = data;
            return { id: 't-new' };
          }),
        },
        user: {
          create: vi.fn().mockResolvedValue({
            id: 'u-new',
            tenantId: 't-new',
            tenant: { id: 't-new', isActive: true },
          }),
        },
      }),
    );
    await service.resolveSsoUser('google', 'ceo@acme.com', 'The CEO', 'signup', signup);
    expect(created.name).toBe('Acme Health');
    expect(created.country).toBe('India');
  });

  it('rejects signup when the email already exists (even inactive)', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.resolveSsoUser('google', 'taken@acme.com', 'Taken', 'signup', signup),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an email that resolves to multiple active tenants', async () => {
    prisma.user.findMany.mockResolvedValue([
      activeUser({ tenantId: 't1' }),
      activeUser({ id: 'u2', tenantId: 't2', tenant: { id: 't2', isActive: true } }),
    ]);
    await expect(
      service.resolveSsoUser('google', 'jane@acme.com', 'Jane', 'signup', signup),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
