import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Tenant, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../../common/types/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.tenant.isActive) {
      throw new UnauthorizedException('Tenant is inactive');
    }

    return this.issueSession(user);
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

  async googleLogin(user: User & { tenant: Tenant }) {
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
