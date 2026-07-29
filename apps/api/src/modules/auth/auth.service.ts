import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Tenant, User, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from '../../common/types/jwt-payload.interface';

const BCRYPT_COST = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Self-service signup: provisions a new tenant and its first TENANT_ADMIN,
   * then issues a session. Email must be globally unique so Google SSO stays
   * unambiguous (invite-only match-by-email, see AUTH-AND-RBAC.md).
   */
  async register(dto: RegisterDto, ipAddress?: string | null) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const slug = await this.uniqueTenantSlug(dto.organizationName);

    const { user, tenant } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.organizationName.trim(), slug },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName.trim(),
          role: UserRole.TENANT_ADMIN,
        },
      });
      return { user, tenant };
    });

    await this.audit.record({
      tenantId: tenant.id,
      userId: user.id,
      ipAddress,
      action: 'auth.register',
      resourceType: 'tenant',
      resourceId: tenant.id,
      details: { email: user.email, organizationName: tenant.name },
    });

    return this.issueSession({ ...user, tenant });
  }

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
   * Invite-only match-by-email for Google SSO. Returns the matching active
   * user; never creates one (tenant admins provision users explicitly).
   */
  async validateGoogleUser(email: string): Promise<User & { tenant: Tenant }> {
    const users = await this.prisma.user.findMany({
      where: { email, isActive: true },
      include: { tenant: true },
    });

    const activeTenantUsers = users.filter((u) => u.tenant.isActive);

    if (activeTenantUsers.length === 0) {
      throw new UnauthorizedException(
        'No account exists for this Google email. Ask your administrator for an invite.',
      );
    }
    if (activeTenantUsers.length > 1) {
      // Email exists under more than one tenant — SSO cannot disambiguate.
      throw new UnauthorizedException(
        'This email belongs to multiple organizations. Sign in with email and password instead.',
      );
    }
    return activeTenantUsers[0];
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
