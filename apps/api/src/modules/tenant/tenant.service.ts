import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { name: string; slug: string; settings?: Record<string, unknown> }) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException(`Tenant with slug "${data.slug}" already exists`);
    }

    return this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        settings: (data.settings ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findAll() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async update(id: string, data: { name?: string; slug?: string; isActive?: boolean; settings?: Record<string, unknown> }) {
    await this.findOne(id);
    const updateData: Prisma.TenantUpdateInput = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.slug !== undefined && { slug: data.slug }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.settings !== undefined && { settings: data.settings as Prisma.InputJsonValue }),
    };
    return this.prisma.tenant.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
