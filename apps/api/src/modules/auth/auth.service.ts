import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Tenant, User, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { GoogleSignupDetails } from './google.strategy';
import { JwtPayload } from '../../common/types/jwt-payload.interface';

const BCRYPT_COST = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string | null) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      await this.recordFailedLogin(dto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await this.recordFailedLogin(dto.email, ipAddress, user.tenantId, user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.tenant.isActive) {
      throw new UnauthorizedException('Tenant is inactive');
    }

    await this.audit.record({
      tenantId: user.tenantId,
      userId: user.id,
      ipAddress,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email, method: 'password' },
    });

    return this.issueSession(user);
  }

  private async recordFailedLogin(
    email: string,
    ipAddress?: string | null,
    tenantId?: string,
    userId?: string,
  ) {
    // Best-effort; a failed login with no matching user has no tenant to scope
    // to, so we fall back to the nil UUID for the audit tenant column.
    await this.audit.record({
      tenantId: tenantId ?? '00000000-0000-0000-0000-000000000000',
      userId,
      ipAddress,
      action: 'auth.login.failed',
      resourceType: 'user',
      details: { email },
    });
  }

  /** Slugify the org name and guarantee uniqueness with a short suffix. */
  private async uniqueTenantSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'org';
    let slug = base;
    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return slug;
  }

  /**
   * Resolve a Google identity to an app user.
   *
   * - An existing single active account signs in (either intent).
   * - With `mode='signup'` and no existing account, a new tenant + first
   *   TENANT_ADMIN is provisioned using the organization name and country
   *   collected before the OAuth handshake (both mandatory).
   * - With `mode='login'` and no account, or an ambiguous multi-tenant email,
   *   it is rejected — SSO stays invite-only for plain login.
   */
  async resolveGoogleUser(
    email: string,
    displayName: string | undefined,
    mode: 'login' | 'signup',
    signup?: GoogleSignupDetails,
    ipAddress?: string | null,
  ): Promise<User & { tenant: Tenant }> {
    const users = await this.prisma.user.findMany({
      where: { email, isActive: true },
      include: { tenant: true },
    });
    const activeTenantUsers = users.filter((u) => u.tenant.isActive);

    if (activeTenantUsers.length === 1) {
      return activeTenantUsers[0];
    }
    if (activeTenantUsers.length > 1) {
      // Email exists under more than one tenant — SSO cannot disambiguate.
      throw new UnauthorizedException(
        'This email belongs to multiple organizations. Sign in with email and password instead.',
      );
    }

    if (mode !== 'signup') {
      throw new UnauthorizedException(
        'No account exists for this Google email. Sign up first, or ask your administrator for an invite.',
      );
    }

    // Signup intent, no active account. Keep email globally unique so a
    // future login stays unambiguous.
    const anyExisting = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (anyExisting) {
      throw new UnauthorizedException(
        'An account with this email already exists. Please sign in instead.',
      );
    }

    const organizationName = signup?.organizationName?.trim();
    const country = signup?.country?.trim();
    if (!organizationName || !country) {
      // Should not happen — GoogleAuthGuard validates before the handshake —
      // but state can be hand-crafted, so enforce it here too.
      throw new UnauthorizedException(
        'Organization and country are required to sign up.',
      );
    }

    return this.provisionGoogleTenant(
      email,
      displayName,
      organizationName,
      country,
      ipAddress,
    );
  }

  /** Create a new tenant + first TENANT_ADMIN for a Google signup. */
  private async provisionGoogleTenant(
    email: string,
    displayName: string | undefined,
    organizationName: string,
    country: string,
    ipAddress?: string | null,
  ): Promise<User & { tenant: Tenant }> {
    const fullName = displayName?.trim() || email.split('@')[0];
    const slug = await this.uniqueTenantSlug(organizationName);
    // Random hash: the account authenticates via Google, not a password.
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), BCRYPT_COST);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: organizationName, slug, country },
      });
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          fullName,
          role: UserRole.TENANT_ADMIN,
        },
        include: { tenant: true },
      });
    });

    await this.audit.record({
      tenantId: user.tenantId,
      userId: user.id,
      ipAddress,
      action: 'auth.register',
      resourceType: 'tenant',
      resourceId: user.tenantId,
      details: { email, organizationName, country, method: 'google' },
    });

    return user;
  }

  async googleLogin(user: User & { tenant: Tenant }, ipAddress?: string | null) {
    await this.audit.record({
      tenantId: user.tenantId,
      userId: user.id,
      ipAddress,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email, method: 'google' },
    });
    return this.issueSession(user);
  }

  private async issueSession(user: User & { tenant: Tenant }) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant.name,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { tenant: true },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
    };
  }
}
