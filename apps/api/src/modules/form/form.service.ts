import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { AuditService } from '../../common/audit/audit.service';
import { contentHash, verifyContentHash } from '../../common/utils/content-hash';
import { decodeUploadFilename } from '../../common/utils/filename';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

/** Context for auditable mutations (who + from where). */
export interface ActorContext {
  userId: string;
  ipAddress?: string | null;
}

/** The immutable content of a version, used for the published content hash. */
type VersionLike = {
  engine: string;
  schema?: unknown;
  dataSchema?: unknown;
  uiSchema?: unknown;
  printSchema?: unknown;
  translations?: unknown;
};

@Injectable()
export class FormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The canonical payload hashed at publish time. For the formio engine that is
   * the coupled `schema`; for jsonforms it is the separated data/ui/print
   * schemas plus translations. Engine is included so two engines with the same
   * shape never collide.
   */
  private versionPayload(version: VersionLike): Record<string, unknown> {
    if (version.engine === 'JSONFORMS') {
      return {
        engine: version.engine,
        dataSchema: version.dataSchema ?? null,
        uiSchema: version.uiSchema ?? null,
        printSchema: version.printSchema ?? null,
        translations: version.translations ?? null,
      };
    }
    return { engine: version.engine ?? 'FORMIO', schema: version.schema ?? null };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateFormDto,
    ipAddress?: string | null,
  ) {
    const slug = this.toSlug(dto.name);

    const form = await this.prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
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

      // Create an initial empty draft version and mark it active. The active
      // version is used by list, fill, and submission flows.
      const version = await tx.formVersion.create({
        data: {
          formId: created.id,
          version: 1,
          schema: {},
        },
      });

      return tx.form.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
      });
    });

    await this.audit.record({
      tenantId,
      userId,
      ipAddress,
      action: 'form.create',
      resourceType: 'form',
      resourceId: form.id,
      details: { name: form.name },
    });

    return form;
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

      const version = await tx.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          schema: jsonSchema,
        },
      });

      return tx.form.update({
        where: { id: form.id },
        data: { currentVersionId: version.id },
      });
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.form.findMany({
      where: { tenantId },
      include: {
        currentVersion: true,
        // Older rows may predate currentVersionId. Expose their latest version
        // as a safe read-only fallback while they are subsequently updated.
        versions: { orderBy: { version: 'desc' }, take: 1 },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async count(tenantId: string) {
    return this.prisma.form.count({ where: { tenantId } });
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
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.formVersion.update({
          where: { id: latestVersion.id },
          data: { schema: jsonSchema },
        });
        await tx.form.update({
          where: { id: form.id },
          data: { currentVersionId: updated.id },
        });
        return updated;
      });
    }

    const nextVersion = (latestVersion?.version ?? 0) + 1;
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.formVersion.create({
        data: {
          formId: form.id,
          version: nextVersion,
          schema: jsonSchema,
        },
      });
      await tx.form.update({
        where: { id: form.id },
        data: { currentVersionId: created.id },
      });
      return created;
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

  async publish(tenantId: string, id: string, actor?: ActorContext) {
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

    // Formio scoring rules are extracted from the coupled schema; jsonforms
    // versions carry no formio scoring tree.
    const schema = (latestVersion.schema ?? {}) as Record<string, unknown>;
    const scoringRules =
      latestVersion.engine === 'JSONFORMS'
        ? {}
        : this.scoringService.extractRulesFromSchema(schema);
    const hasScoringRules = Object.keys(scoringRules).length > 0;

    // Immutability: hash the canonical published payload so later tampering is
    // detectable (verifyIntegrity). The version becomes read-only once
    // publishedAt is set — subsequent edits fork a new draft (see saveSchema).
    const hash = contentHash(this.versionPayload(latestVersion as VersionLike));

    const published = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.formVersion.update({
        where: { id: latestVersion.id },
        data: {
          publishedAt: new Date(),
          contentHash: hash,
          ...(hasScoringRules
            ? { scoringRules: scoringRules as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      await tx.form.update({
        where: { id: form.id },
        data: {
          currentVersionId: updated.id,
          status: 'PUBLISHED',
        },
      });

      return updated;
    });

    await this.audit.record({
      tenantId,
      userId: actor?.userId,
      ipAddress: actor?.ipAddress,
      action: 'form.publish',
      resourceType: 'form_version',
      resourceId: published.id,
      details: {
        formId: form.id,
        version: published.version,
        engine: published.engine,
        contentHash: hash,
      },
    });

    return published;
  }

  /**
   * Recompute the content hash of a published version and compare it to the
   * stored hash. Returns whether the immutable content is intact — a mismatch
   * indicates the row was edited outside the service layer.
   */
  async verifyIntegrity(tenantId: string, versionId: string) {
    const version = await this.prisma.formVersion.findFirst({
      where: { id: versionId, form: { tenantId } },
    });
    if (!version) {
      throw new NotFoundException(`Form version ${versionId} not found`);
    }
    if (!version.publishedAt || !version.contentHash) {
      return { versionId, published: false, intact: null as boolean | null };
    }
    const intact = verifyContentHash(
      this.versionPayload(version as VersionLike),
      version.contentHash,
    );
    return { versionId, published: true, intact };
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

  /**
   * Counts of related records that a permanent delete would destroy.
   * Used to show an accurate confirmation prompt before deletion.
   */
  async deletionSummary(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);
    const [versionCount, submissionCount] = await Promise.all([
      this.prisma.formVersion.count({ where: { formId: form.id } }),
      this.prisma.submission.count({ where: { formId: form.id, tenantId } }),
    ]);
    return { formName: form.name, versionCount, submissionCount };
  }

  /**
   * Permanently deletes a form and ALL of its related data (versions,
   * submissions, AI chat messages). This is irreversible.
   *
   * Order matters: submissions reference both form and form_version, and
   * Form.currentVersionId <-> FormVersion.formId form a circular FK, so we
   * null the pointer before deleting versions. FormAiMessage cascades on
   * form delete but is removed explicitly for clarity.
   */
  async remove(tenantId: string, id: string, actor?: ActorContext) {
    const form = await this.findOne(tenantId, id);

    const result = await this.prisma.$transaction(async (tx) => {
      const submissions = await tx.submission.deleteMany({
        where: { formId: form.id, tenantId },
      });
      await tx.formAiMessage.deleteMany({
        where: { formId: form.id, tenantId },
      });
      await tx.form.update({
        where: { id: form.id },
        data: { currentVersionId: null },
      });
      const versions = await tx.formVersion.deleteMany({
        where: { formId: form.id },
      });
      await tx.form.delete({ where: { id: form.id } });

      return {
        deleted: true,
        versions: versions.count,
        submissions: submissions.count,
      };
    });

    await this.audit.record({
      tenantId,
      userId: actor?.userId,
      ipAddress: actor?.ipAddress,
      action: 'form.delete',
      resourceType: 'form',
      resourceId: form.id,
      details: {
        name: form.name,
        versionsDeleted: result.versions,
        submissionsDeleted: result.submissions,
      },
    });

    return result;
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

  /**
   * Export a complete, self-contained, renderer-ready form definition.
   *
   * The result is engine-aware: for the jsonforms engine it carries the
   * separated dataSchema / uiSchema / printSchema / translations (the exact
   * shape the @openmedform renderers accept as their `definition` prop), so an
   * external app can render the form and collect responses without this backend.
   * For formio it carries the coupled schema + scoringRules. Exports the
   * published version if present, otherwise the latest draft (so designers can
   * download work in progress).
   */
  /**
   * Load any binary assets stored for a version and inline them as base64
   * data URIs so the export is fully self-contained (no external fetch needed
   * to render). Empty until an asset-upload flow populates FormAsset.
   */
  private async loadExportAssets(versionId: string) {
    const assets = await this.prisma.formAsset.findMany({
      where: { formVersionId: versionId },
    });
    return assets.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      checksum: a.checksum ?? undefined,
      // Inline the bytes when stored in-DB; otherwise expose the storage key.
      dataUri: a.data
        ? `data:${a.mimeType};base64,${Buffer.from(a.data).toString('base64')}`
        : undefined,
      storageKey: a.storageKey ?? undefined,
    }));
  }

  // ─── Assets (logos/images referenced by the form) ──────────────────────────

  private assetMeta(a: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string | null;
    createdAt: Date;
  }) {
    return {
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      checksum: a.checksum ?? undefined,
      createdAt: a.createdAt,
    };
  }

  /** All version ids for a form (assets attach to a specific version). */
  private async formVersionIds(form: { id: string }): Promise<string[]> {
    const versions = await this.prisma.formVersion.findMany({
      where: { formId: form.id },
      select: { id: true },
    });
    return versions.map((v) => v.id);
  }

  /** Upload a binary asset (stored in-DB) attached to the form's latest version. */
  async uploadAsset(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
    actor?: ActorContext,
  ) {
    const form = await this.findOne(tenantId, id);
    const version = form.currentVersion ?? form.versions?.[0];
    if (!version) {
      throw new BadRequestException('Form has no version to attach an asset to');
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const asset = await this.prisma.formAsset.create({
      data: {
        tenantId,
        formVersionId: version.id,
        filename: decodeUploadFilename(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksum,
        // Copy into a fresh Uint8Array<ArrayBuffer> for Prisma's Bytes type.
        data: new Uint8Array(file.buffer),
      },
    });

    await this.audit.record({
      tenantId,
      userId: actor?.userId,
      ipAddress: actor?.ipAddress,
      action: 'form.asset.upload',
      resourceType: 'form_asset',
      resourceId: asset.id,
      details: { formId: id, filename: asset.filename, sizeBytes: asset.sizeBytes },
    });

    return this.assetMeta(asset);
  }

  /** List asset metadata (no bytes) for all of a form's versions. */
  async listAssets(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);
    const versionIds = await this.formVersionIds(form);
    const assets = await this.prisma.formAsset.findMany({
      where: { tenantId, formVersionId: { in: versionIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        checksum: true,
        createdAt: true,
      },
    });
    return assets.map((a) => this.assetMeta(a));
  }

  /** Fetch a single asset with its bytes, scoped to the form + tenant. */
  async getAsset(tenantId: string, id: string, assetId: string) {
    const form = await this.findOne(tenantId, id);
    const versionIds = await this.formVersionIds(form);
    const asset = await this.prisma.formAsset.findFirst({
      where: { id: assetId, tenantId, formVersionId: { in: versionIds } },
    });
    if (!asset || !asset.data) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }
    return {
      filename: asset.filename,
      mimeType: asset.mimeType,
      data: Buffer.from(asset.data),
    };
  }

  async deleteAsset(
    tenantId: string,
    id: string,
    assetId: string,
    actor?: ActorContext,
  ) {
    const form = await this.findOne(tenantId, id);
    const versionIds = await this.formVersionIds(form);
    const asset = await this.prisma.formAsset.findFirst({
      where: { id: assetId, tenantId, formVersionId: { in: versionIds } },
      select: { id: true },
    });
    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }
    await this.prisma.formAsset.delete({ where: { id: asset.id } });
    await this.audit.record({
      tenantId,
      userId: actor?.userId,
      ipAddress: actor?.ipAddress,
      action: 'form.asset.delete',
      resourceType: 'form_asset',
      resourceId: assetId,
      details: { formId: id },
    });
    return { deleted: true };
  }

  async exportTemplate(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);
    const version = form.currentVersion ?? form.versions?.[0];
    if (!version) {
      throw new BadRequestException('Form has no version to export');
    }

    const assets = await this.loadExportAssets(version.id);

    const base = {
      openmedform: '1.0',
      exportedAt: new Date().toISOString(),
      engine: version.engine === 'JSONFORMS' ? 'jsonforms' : 'formio',
      formCode: form.slug,
      name: form.name,
      description: form.description ?? undefined,
      category: form.category ?? undefined,
      formType: form.formType,
      tags: form.tags,
      version: String(version.version),
      status: form.status,
    };

    if (version.engine === 'JSONFORMS') {
      const translations = version.translations as
        | { defaultLanguage?: string }
        | null;
      return {
        ...base,
        language: translations?.defaultLanguage ?? 'en',
        dataSchema: (version.dataSchema ?? {}) as Record<string, unknown>,
        uiSchema:
          (version.uiSchema as Record<string, unknown> | null) ?? {
            schemaVersion: '1.0',
            layout: { type: 'VerticalLayout', elements: [] },
          },
        printSchema: (version.printSchema as Record<string, unknown> | null) ?? null,
        translations:
          (version.translations as Record<string, unknown> | null) ?? {
            defaultLanguage: 'en',
            languages: ['en'],
            entries: {},
          },
        conversionMetadata:
          (version.conversionMetadata as Record<string, unknown> | null) ?? undefined,
        assets,
      };
    }

    // formio engine
    return {
      ...base,
      schema: (version.schema ?? { display: 'form', components: [] }) as Record<
        string,
        unknown
      >,
      scoringRules: (version.scoringRules as Record<string, unknown> | null) ?? {},
      assets,
      patientContextFields:
        form.formType === 'PATIENT'
          ? ['patientName', 'patientMrn', 'age', 'gender', 'encounterId']
          : [],
    };
  }

  /**
   * Return the stored Form.io definition without the OpenMedForm template
   * envelope. This is the portable shape expected by Form.io consumers:
   * `{ display, components }` (plus any other native Form.io properties).
   */
  async exportNativeFormioSchema(tenantId: string, id: string) {
    const form = await this.findOne(tenantId, id);
    const version = form.currentVersion ?? form.versions?.[0];
    if (!version) {
      throw new BadRequestException('Form has no version to export');
    }
    if (version.engine === 'JSONFORMS') {
      throw new BadRequestException(
        'Native Form.io export is only available for Form.io forms',
      );
    }

    return (version.schema ?? {
      display: 'form',
      components: [],
    }) as Record<string, unknown>;
  }

  async importTemplate(tenantId: string, userId: string, template: Record<string, unknown>) {
    if (!template.openmedform) {
      throw new BadRequestException('Invalid template: missing openmedform version');
    }

    // Accept the flat bundle (new export) and the legacy { form: {...} } shape.
    const meta = (template.form as Record<string, unknown> | undefined) ?? template;
    const baseName = meta.name as string | undefined;
    if (!baseName) {
      throw new BadRequestException('Invalid template: missing form name');
    }

    // engine defaults to formio for legacy templates that predate the field.
    const engine: 'FORMIO' | 'JSONFORMS' =
      String(template.engine ?? 'formio').toUpperCase() === 'JSONFORMS'
        ? 'JSONFORMS'
        : 'FORMIO';

    const json = (v: unknown) => v as unknown as Prisma.InputJsonValue;

    // Build the engine-specific version payload, validating required artifacts.
    let versionData: Prisma.FormVersionUncheckedCreateWithoutFormInput;
    if (engine === 'JSONFORMS') {
      const dataSchema = template.dataSchema as Record<string, unknown> | undefined;
      const uiSchema = template.uiSchema as Record<string, unknown> | undefined;
      if (!dataSchema || !uiSchema) {
        throw new BadRequestException(
          'Invalid jsonforms template: missing dataSchema or uiSchema',
        );
      }
      versionData = {
        version: 1,
        engine: 'JSONFORMS',
        dataSchema: json(dataSchema),
        uiSchema: json(uiSchema),
        ...(template.printSchema ? { printSchema: json(template.printSchema) } : {}),
        ...(template.translations ? { translations: json(template.translations) } : {}),
        ...(template.conversionMetadata
          ? { conversionMetadata: json(template.conversionMetadata) }
          : {}),
      };
    } else {
      const schema = template.schema as Record<string, unknown> | undefined;
      if (!schema) {
        throw new BadRequestException('Invalid formio template: missing schema');
      }
      const scoringRules = template.scoringRules as Record<string, unknown> | undefined;
      versionData = {
        version: 1,
        engine: 'FORMIO',
        schema: json(schema),
        ...(scoringRules && Object.keys(scoringRules).length > 0
          ? { scoringRules: json(scoringRules) }
          : {}),
      };
    }

    const baseSlug = this.toSlug(baseName);
    const existing = await this.prisma.form.findFirst({
      where: { tenantId, slug: baseSlug },
    });
    const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;
    const name = existing ? `${baseName} (Imported)` : baseName;

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name,
          slug,
          description: (meta.description as string) ?? null,
          category: (meta.category as string) ?? null,
          tags: (meta.tags as string[]) ?? [],
          formType: (meta.formType as 'PATIENT' | 'NON_PATIENT') ?? 'PATIENT',
          createdById: userId,
        },
      });

      await tx.formVersion.create({
        data: { formId: form.id, ...versionData },
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
