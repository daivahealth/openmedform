import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ScoringService, ScoringRules } from '../scoring/scoring.service';
import { AuditService } from '../../common/audit/audit.service';
import { SchemaValidationService } from '../validation/schema-validation.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';

/** Actor context for auditable submission actions. */
export interface SubmissionActor {
  userId: string;
  displayName?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly audit: AuditService,
    private readonly validation: SchemaValidationService,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    formId: string,
    dto: CreateSubmissionDto,
  ) {
    // Verify form belongs to tenant and has a published version
    const form = await this.prisma.form.findFirst({
      where: { id: formId, tenantId },
      include: { currentVersion: true },
    });

    if (!form) {
      throw new NotFoundException(`Form ${formId} not found`);
    }

    if (!form.currentVersionId || !form.currentVersion) {
      throw new BadRequestException('Form has no published version');
    }

    const patientMrn =
      dto.patientMrn ?? dto.patientContext?.patientMrn ?? null;
    const encounterId =
      dto.encounterId ?? dto.patientContext?.encounterId ?? null;

    return this.prisma.submission.create({
      data: {
        tenantId,
        formId: form.id,
        formVersionId: form.currentVersionId,
        submittedById: userId,
        data: {},
        patientMrn,
        encounterId,
        ...(dto.patientContext
          ? { patientContext: dto.patientContext as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.submission.findMany({
      where: { tenantId },
      include: {
        form: { select: { id: true, name: true, slug: true } },
        submittedBy: { select: { id: true, fullName: true, email: true } },
        formVersion: { select: { id: true, version: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(tenantId: string) {
    return this.prisma.submission.count({ where: { tenantId } });
  }

  async findAllByForm(tenantId: string, formId: string) {
    return this.prisma.submission.findMany({
      where: { tenantId, formId },
      include: {
        submittedBy: { select: { id: true, fullName: true, email: true } },
        formVersion: { select: { id: true, version: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { id, tenantId },
      include: {
        form: { select: { id: true, name: true, slug: true } },
        formVersion: true,
        submittedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${id} not found`);
    }
    return submission;
  }

  async updateData(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    const submission = await this.findOne(tenantId, id);

    if (submission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Only in-progress submissions can be updated');
    }

    return this.prisma.submission.update({
      where: { id: submission.id },
      data: { data: data as unknown as Prisma.InputJsonValue },
    });
  }

  async complete(tenantId: string, id: string, actor?: SubmissionActor) {
    const submission = await this.findOne(tenantId, id);

    if (submission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Only in-progress submissions can be completed');
    }

    const submissionData = (submission.data ?? {}) as Record<string, unknown>;

    // Server-side validation is authoritative for the jsonforms engine: never
    // trust client-side validity. Formio versions keep their existing flow.
    const version = submission.formVersion;
    if (version?.engine === 'JSONFORMS' && version.dataSchema) {
      const result = this.validation.validate(version.dataSchema, submissionData);
      if (!result.valid) {
        throw new BadRequestException({
          message: 'Submission failed server-side validation',
          errors: result.errors,
        });
      }
    }

    const updateData: Record<string, unknown> = { status: 'COMPLETED' };

    const scoringRules = version?.scoringRules as Record<string, unknown> | null;
    if (scoringRules && Object.keys(scoringRules).length > 0) {
      const result = this.scoringService.calculate(
        scoringRules as unknown as ScoringRules,
        submissionData,
      );
      updateData.scores = result.scores as unknown as Prisma.InputJsonValue;
      if (result.riskLevel) {
        updateData.riskLevel = result.riskLevel;
      }
    }

    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: updateData,
    });

    await this.audit.record({
      tenantId,
      userId: actor?.userId,
      ipAddress: actor?.ipAddress,
      action: 'submission.complete',
      resourceType: 'submission',
      resourceId: submission.id,
      details: {
        formId: submission.formId,
        formVersionId: submission.formVersionId,
        engine: version?.engine,
        riskLevel: updateData.riskLevel ?? null,
      },
    });

    return updated;
  }

  /**
   * Sign a completed submission. Signing is a clinical attestation: it locks the
   * response (status SIGNED) and records who signed it and when. A submission
   * must be COMPLETED (and thus server-validated) before it can be signed.
   */
  async sign(tenantId: string, id: string, actor: SubmissionActor) {
    const submission = await this.findOne(tenantId, id);

    if (submission.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed submissions can be signed');
    }

    const signedBy = actor.displayName ?? actor.userId;
    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signedBy,
      },
    });

    await this.audit.record({
      tenantId,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      action: 'submission.sign',
      resourceType: 'submission',
      resourceId: submission.id,
      details: { formId: submission.formId, signedBy },
    });

    return updated;
  }
}
