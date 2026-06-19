import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserRole } from '@prisma/client';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { uq_user_tenant_email: { tenantId, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists in this tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role as UserRole,
      },
    });

    return this.sanitize(user);
  }

  async findAll(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(this.sanitize);
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return this.sanitize(user);
  }

  async update(
    tenantId: string,
    id: string,
    data: { fullName?: string; role?: string; isActive?: boolean },
  ) {
    await this.findOne(tenantId, id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.role !== undefined && { role: data.role as UserRole }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
    return this.sanitize(user);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return this.sanitize(user);
  }

  private sanitize(user: Record<string, unknown>) {
    const { passwordHash, ...rest } = user as Record<string, unknown> & { passwordHash: string };
    return rest;
  }
}
