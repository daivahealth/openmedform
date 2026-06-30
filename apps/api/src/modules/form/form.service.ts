import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

@Injectable()
export class FormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateFormDto) {
    const slug = this.toSlug(dto.name);

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: dto.name,
          slug,
          description: dto.description,
          category: dto.category,
          tags: dto.tags ?? [],
          formType: dto.formType,
          createdById: userId,
        },
      });

      // Create an initial empty draft version
      await tx.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          schema: {},
        },
      });

      return form;
    });
  }

  async createWithSchema(
    tenantId: string,
    userId: string,
    dto: CreateFormDto,
    schema: Record<string, unknown>,
  ) {
    const slug = await this.uniqueSlug(tenantId, dto.name);
    const jsonSchema = schema as unknown as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: dto.name,
          slug,
          description: dto.description,
          category: dto.category,
          tags: dto.tags ?? [],
          formType: dto.formType,
          createdById: userId,
        },
      });

      await tx.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          schema: jsonSchema,
        },
      });

      return form;
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.form.findMany({
      where: { tenantId },
      include: { currentVersion: true, createdBy: { select: { id: true, fullName: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const form = await this.prisma.form.findFirst({
      where: { id, tenantId },
      include: {
        versions: { orderBy: { version: 'desc' } },
        currentVersion: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!form) {
      throw new NotFoundException(`Form ${id} not found`);
    }
    return form;
  }

  async update(tenantId: string, id: string, dto: UpdateFormDto) {
    const form = await this.findOne(tenantId, id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
      data.slug = this.toSlug(dto.name);
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.formType !== undefined) data.formType = dto.formType;

    return this.prisma.form.update({
      where: { id: form.id },
      data,
    });
  }

  async saveSchema(tenantId: string, id: string, schema: Record<string, unknown>) {
    const form = await this.findOne(tenantId, id);
    const jsonSchema = schema as unknown as Prisma.InputJsonValue;

    const latestVersion = await this.prisma.formVersion.findFirst({
      where: { formId: form.id },
      orderBy: { version: 'desc' },
    });

    if (latestVersion && !latestVersion.publishedAt) {
      return this.prisma.formVersion.update({
        where: { id: latestVersion.id },
        data: { schema: jsonSchema },
      });
    }

    const nextVersion = (latestVersion?.version ?? 0) + 1;
    return this.prisma.formVersion.create({
      data: {
        formId: form.id,
        version: nextVersion,
        schema: jsonSchema,
      },
    });
  }

  async getLatestSchema(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);
    const latestVersion = form.versions?.[0] ?? form.currentVersion;

    return (latestVersion?.schema ?? {
      display: 'form',
      components: [],
    }) as Record<string, unknown>;
  }

  async publish(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);

    const latestVersion = await this.prisma.formVersion.findFirst({
      where: { formId: form.id },
      orderBy: { version: 'desc' },
    });

    if (!latestVersion) {
      throw new BadRequestException('No version exists to publish');
    }

    if (latestVersion.publishedAt) {
      throw new BadRequestException('Latest version is already published');
    }

    const schema = latestVersion.schema as Record<string, unknown>;
    const scoringRules = this.scoringService.extractRulesFromSchema(schema);
    const hasScoringRules = Object.keys(scoringRules).length > 0;

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.formVersion.update({
        where: { id: latestVersion.id },
        data: {
          publishedAt: new Date(),
          ...(hasScoringRules
            ? { scoringRules: scoringRules as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      await tx.form.update({
        where: { id: form.id },
        data: {
          currentVersionId: published.id,
          status: 'PUBLISHED',
        },
      });

      return published;
    });
  }

  async findBySlug(tenantId: string, slug: string) {
    const form = await this.prisma.form.findFirst({
      where: { slug, tenantId, status: 'PUBLISHED' },
      include: {
        currentVersion: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!form) {
      throw new NotFoundException(`Published form with slug "${slug}" not found`);
    }
    return form;
  }

  async archive(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);
    return this.prisma.form.update({
      where: { id: form.id },
      data: { status: 'ARCHIVED' },
    });
  }

  async clone(tenantId: string, userId: string, formId: string) {
    const source = await this.findOne(tenantId, formId);

    const timestamp = Date.now();
    const slug = `${source.slug}-copy-${timestamp}`;

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: `Copy of ${source.name}`,
          slug,
          description: source.description,
          category: source.category,
          tags: source.tags,
          formType: source.formType,
          createdById: userId,
        },
      });

      const sourceVersion = source.currentVersion ?? source.versions?.[0];
      const schema = (sourceVersion?.schema ?? {}) as Prisma.InputJsonValue;
      const scoringRules = sourceVersion?.scoringRules
        ? (sourceVersion.scoringRules as Prisma.InputJsonValue)
        : undefined;

      await tx.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          schema,
          ...(scoringRules !== undefined ? { scoringRules } : {}),
        },
      });

      return form;
    });
  }

  async exportTemplate(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);

    if (!form.currentVersion) {
      throw new BadRequestException('Form must be published before exporting');
    }

    const schema = form.currentVersion.schema as Record<string, unknown>;
    const scoringRules = form.currentVersion.scoringRules as Record<string, unknown> | null;

    return {
      openmedform: '1.0',
      exportedAt: new Date().toISOString(),
      form: {
        name: form.name,
        description: form.description,
        category: form.category,
        formType: form.formType,
        tags: form.tags,
      },
      schema,
      scoringRules: scoringRules ?? {},
      patientContextFields:
        form.formType === 'PATIENT'
          ? ['patientName', 'patientMrn', 'age', 'gender', 'encounterId']
          : [],
    };
  }

  async importTemplate(tenantId: string, userId: string, template: Record<string, unknown>) {
    const version = template.openmedform as string;
    if (!version) {
      throw new BadRequestException('Invalid template: missing openmedform version');
    }

    const formMeta = template.form as Record<string, unknown>;
    const schema = template.schema as Record<string, unknown>;
    if (!formMeta?.name || !schema) {
      throw new BadRequestException('Invalid template: missing form metadata or schema');
    }

    const baseName = formMeta.name as string;
    const baseSlug = this.toSlug(baseName);

    const existing = await this.prisma.form.findFirst({
      where: { tenantId, slug: baseSlug },
    });
    const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;
    const name = existing ? `${baseName} (Imported)` : baseName;

    const scoringRules = template.scoringRules as Record<string, unknown> | undefined;
    const hasScoringRules = scoringRules && Object.keys(scoringRules).length > 0;

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name,
          slug,
          description: (formMeta.description as string) ?? null,
          category: (formMeta.category as string) ?? null,
          tags: (formMeta.tags as string[]) ?? [],
          formType: (formMeta.formType as 'PATIENT' | 'NON_PATIENT') ?? 'PATIENT',
          createdById: userId,
        },
      });

      await tx.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          schema: schema as unknown as Prisma.InputJsonValue,
          ...(hasScoringRules
            ? { scoringRules: scoringRules as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      return form;
    });
  }

  async getAiMessages(tenantId: string, formId: string) {
    await this.findOne(tenantId, formId);
    return this.prisma.formAiMessage.findMany({
      where: { tenantId, formId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, provider: true, createdAt: true },
    });
  }

  async addAiMessage(
    tenantId: string,
    formId: string,
    data: { role: string; content: string; provider?: string },
  ) {
    await this.findOne(tenantId, formId);
    return this.prisma.formAiMessage.create({
      data: {
        tenantId,
        formId,
        role: data.role,
        content: data.content,
        provider: data.provider,
      },
      select: { id: true, role: true, content: true, provider: true, createdAt: true },
    });
  }

  async clearAiMessages(tenantId: string, formId: string) {
    await this.findOne(tenantId, formId);
    await this.prisma.formAiMessage.deleteMany({
      where: { tenantId, formId },
    });
    return { cleared: true };
  }

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async uniqueSlug(tenantId: string, name: string): Promise<string> {
    const baseSlug = this.toSlug(name);
    const existing = await this.prisma.form.findFirst({
      where: { tenantId, slug: baseSlug },
      select: { id: true },
    });

    return existing ? `${baseSlug}-${Date.now()}` : baseSlug;
  }
}
