import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ScoringService, ScoringRules } from '../scoring/scoring.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
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

    return this.prisma.submission.create({
      data: {
        tenantId,
        formId: form.id,
        formVersionId: form.currentVersionId,
        submittedById: userId,
        data: {},
        patientMrn: dto.patientMrn,
        encounterId: dto.encounterId,
      },
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

  async complete(tenantId: string, id: string) {
    const submission = await this.findOne(tenantId, id);

    if (submission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Only in-progress submissions can be completed');
    }

    const updateData: Record<string, unknown> = { status: 'COMPLETED' };

    const scoringRules = submission.formVersion?.scoringRules as Record<
      string,
      unknown
    > | null;
    if (scoringRules && Object.keys(scoringRules).length > 0) {
      const submissionData = (submission.data ?? {}) as Record<string, unknown>;
      const result = this.scoringService.calculate(
        scoringRules as unknown as ScoringRules,
        submissionData,
      );
      updateData.scores = result.scores as unknown as Prisma.InputJsonValue;
      if (result.riskLevel) {
        updateData.riskLevel = result.riskLevel;
      }
    }

    return this.prisma.submission.update({
      where: { id: submission.id },
      data: updateData,
    });
  }
}
