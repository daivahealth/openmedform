import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Focused coverage for the Google login/signup resolver — the branch that
 * cannot be exercised against a live server without Google credentials.
 */
describe('AuthService.resolveGoogleUser', () => {
  let prisma: any;
  let audit: any;
  let service: AuthService;

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
    const result = await service.resolveGoogleUser('jane@acme.com', 'Jane', 'login');
    expect(result.id).toBe('u1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown email on login intent (invite-only)', async () => {
    await expect(
      service.resolveGoogleUser('nobody@acme.com', 'Nobody', 'login'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('provisions a new tenant + admin on signup intent for an unknown email', async () => {
    const result = await service.resolveGoogleUser('new@acme.com', 'New Person', 'signup');
    expect(result.id).toBe('u-new');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.register', details: expect.objectContaining({ method: 'google' }) }),
    );
  });

  it('rejects signup when the email already exists (even inactive)', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.resolveGoogleUser('taken@acme.com', 'Taken', 'signup'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an email that resolves to multiple active tenants', async () => {
    prisma.user.findMany.mockResolvedValue([
      activeUser({ tenantId: 't1' }),
      activeUser({ id: 'u2', tenantId: 't2', tenant: { id: 't2', isActive: true } }),
    ]);
    await expect(
      service.resolveGoogleUser('jane@acme.com', 'Jane', 'signup'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('derives a company org name from a business email domain', async () => {
    let createdName: string | undefined;
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tenant: {
          create: vi.fn(async ({ data }: any) => {
            createdName = data.name;
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
    await service.resolveGoogleUser('ceo@acme.com', 'The CEO', 'signup');
    expect(createdName).toBe('Acme');
  });

  it('falls back to a personal org name for a consumer email', async () => {
    let createdName: string | undefined;
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tenant: {
          create: vi.fn(async ({ data }: any) => {
            createdName = data.name;
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
    await service.resolveGoogleUser('sajithchandran@gmail.com', 'Sajith Chandran', 'signup');
    expect(createdName).toBe("Sajith's Organization");
  });
});
