import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
  /**
   * Needed only by the removal paths, which distinguish "my own record" from
   * "anyone's record in this tenant". Optional so existing callers are
   * unaffected; absent means non-admin, which is the safe reading.
   */
  role?: string;
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

  /**
   * Voided records are excluded by default. Voiding is how a record is
   * "deleted" from a user's point of view, so leaving them in the list would
   * make the action look like it did nothing — but they are retained, and
   * `includeVoided` brings them back for audit.
   */
  async findAll(tenantId: string, includeVoided = false) {
    return this.prisma.submission.findMany({
      where: { tenantId, ...(includeVoided ? {} : { status: { not: 'VOIDED' } }) },
      include: {
        form: { select: { id: true, name: true, slug: true } },
        submittedBy: { select: { id: true, fullName: true, email: true } },
        formVersion: { select: { id: true, version: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(tenantId: string) {
    // Matches the default list, so the dashboard total and the visible rows
    // cannot disagree.
    return this.prisma.submission.count({
      where: { tenantId, status: { not: 'VOIDED' } },
    });
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

    // Server-side validation is authoritative: never trust client-side validity.
    const version = submission.formVersion;
    if (version?.dataSchema) {
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

  /**
   * Void a submission — the clinical equivalent of deleting it.
   *
   * A completed or signed submission is a clinical record, so it is retracted
   * rather than destroyed: the row and its data stay, the status becomes
   * VOIDED, and it drops out of the default list. `VOIDED` was already in the
   * status enum for exactly this; nothing new had to be invented.
   *
   * Anyone may void their own record. Voiding someone else's is an
   * administrative act.
   */
  async voidSubmission(tenantId: string, id: string, actor: SubmissionActor) {
    const submission = await this.findOne(tenantId, id);
    this.assertMayRemove(submission.submittedById, actor, 'void');

    if (submission.status === 'VOIDED') {
      // Idempotent: a double-click should not read as a failure.
      return submission;
    }

    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: { status: 'VOIDED' },
    });

    await this.audit.record({
      tenantId,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      action: 'submission.void',
      resourceType: 'submission',
      resourceId: submission.id,
      details: {
        formId: submission.formId,
        previousStatus: submission.status,
        patientMrn: submission.patientMrn,
      },
    });

    return updated;
  }

  /**
   * Destroy a submission permanently.
   *
   * Unlike voiding, this is unrecoverable, so it is restricted to tenant
   * admins. The audit entry is written with everything needed to know WHAT was
   * destroyed — form, status, patient MRN, who submitted it and when — because
   * once the row is gone that entry is the only remaining trace.
   */
  async removePermanently(tenantId: string, id: string, actor: SubmissionActor) {
    const submission = await this.findOne(tenantId, id);
    if (!isTenantAdmin(actor.role)) {
      throw new ForbiddenException(
        'Only an administrator can permanently delete a record. You can void it instead, ' +
          'which removes it from the list but keeps it for audit.',
      );
    }

    // Recorded BEFORE the delete: after it, there is nothing left to describe.
    await this.audit.record({
      tenantId,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      action: 'submission.delete',
      resourceType: 'submission',
      resourceId: submission.id,
      details: {
        formId: submission.formId,
        formName: submission.form?.name,
        status: submission.status,
        patientMrn: submission.patientMrn,
        encounterId: submission.encounterId,
        submittedById: submission.submittedById,
        submittedAt: submission.createdAt?.toISOString(),
        signedAt: submission.signedAt?.toISOString() ?? null,
      },
    });

    await this.prisma.submission.delete({ where: { id: submission.id } });
    return { deleted: true, id: submission.id };
  }

  /** Own record, or an admin acting on someone else's. */
  private assertMayRemove(ownerId: string, actor: SubmissionActor, action: string): void {
    if (actor.userId === ownerId || isTenantAdmin(actor.role)) return;
    throw new ForbiddenException(
      `You can only ${action} records you submitted. Ask an administrator to ${action} someone else's.`,
    );
  }
}

/** TENANT_ADMIN and above may act on any record in their tenant. */
function isTenantAdmin(role: string | undefined): boolean {
  return role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
}
