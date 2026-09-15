/**
 * Observation read model (ADR-005 §5).
 *
 * Populated when a submission completes — delete-by-submission, then insert —
 * so a re-run is idempotent and `scripts/backfill-observations.ts` can rebuild
 * the table from `submission.data` at any time. Queried by the web app's
 * `historyProvider` and by the flowsheet view. Every query is tenant-scoped.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  projectObservations,
  resolveDefinitionEffectiveAt,
  type DefinitionSchemas,
  type Observation,
} from './observation-projection';

/** The slice of a submission + its version the projection needs. */
export interface ProjectableSubmission {
  id: string;
  tenantId: string;
  formId: string;
  formVersionId: string;
  patientMrn: string | null;
  encounterId: string | null;
  data: unknown;
  effectiveAt: Date | null;
  createdAt: Date;
  submittedBy?: { fullName?: string | null } | null;
  formVersion: { dataSchema: unknown; uiSchema: unknown; version?: number } | null;
}

export interface ObservationQuery {
  /** Terminology binding to match (`system` optional; defaults to any system with that code). */
  code?: string;
  system?: string;
  /** Index-free data path; used when the field has no binding. */
  path?: string;
  formId?: string;
  from?: Date;
  to?: Date;
  /** Newest N. Default 5, max 500. */
  limit?: number;
}

const MAX_LIMIT = 500;

@Injectable()
export class ObservationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The clinical time of a submission: the client's explicit value, else a
   * Control flagged `omf.effectiveAt` in the version, else the row's creation.
   */
  resolveEffectiveAt(submission: ProjectableSubmission): Date {
    if (submission.effectiveAt) return submission.effectiveAt;
    const fromDefinition = submission.formVersion
      ? resolveDefinitionEffectiveAt(
          submission.formVersion as DefinitionSchemas,
          (submission.data ?? {}) as Record<string, unknown>,
        )
      : undefined;
    return fromDefinition ? new Date(fromDefinition) : submission.createdAt;
  }

  /** Project a submission's data and replace its observation rows. Returns the rows written. */
  async replaceForSubmission(submission: ProjectableSubmission): Promise<Observation[]> {
    if (!submission.formVersion) return [];
    const effectiveAt = this.resolveEffectiveAt(submission);
    const author = submission.submittedBy?.fullName ?? undefined;
    const rows = projectObservations(
      submission.formVersion as DefinitionSchemas,
      (submission.data ?? {}) as Record<string, unknown>,
      {
        effectiveAt: effectiveAt.toISOString(),
        source: {
          submissionId: submission.id,
          formId: submission.formId,
          formVersionId: submission.formVersionId,
          ...(submission.formVersion.version !== undefined ? { formVersion: submission.formVersion.version } : {}),
          ...(author ? { author } : {}),
        },
      },
    );

    await this.prisma.$transaction([
      this.prisma.observation.deleteMany({ where: { submissionId: submission.id, tenantId: submission.tenantId } }),
      ...(rows.length > 0
        ? [
            this.prisma.observation.createMany({
              data: rows.map((row) => this.toRow(submission, row)),
            }),
          ]
        : []),
    ]);
    return rows;
  }

  /**
   * Prior readings for one patient, newest first — the server side of a
   * renderer's `historyProvider`. Matches by code first; a `path` is used only
   * when no `code` is given, mirroring form-core's alignment rule.
   */
  async forPatient(tenantId: string, patientMrn: string, q: ObservationQuery): Promise<Observation[]> {
    const limit = Math.min(Math.max(q.limit ?? 5, 1), MAX_LIMIT);
    const base: Prisma.ObservationWhereInput = {
      tenantId,
      patientMrn,
      ...(q.formId ? { formId: q.formId } : {}),
      ...(q.from || q.to ? { effectiveAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
      // A voided submission's readings are not history.
      submission: { status: { not: 'VOIDED' } },
    };
    const orderBy: Prisma.ObservationOrderByWithRelationInput[] = [{ effectiveAt: 'desc' }, { id: 'desc' }];

    if (!q.code && q.path) {
      // A path query against rows whose stored path may carry record indices
      // (`hourly.2.hr` for a query of `hourly.hr`). Postgres has no cheap
      // index-free-path column, so fetch by prefix and filter in memory,
      // bounded by the same limit after filtering.
      const rows = await this.prisma.observation.findMany({
        where: { ...base, path: { startsWith: q.path.split('.')[0] } },
        orderBy,
        take: limit * 20,
        select: { row: true, path: true },
      });
      return rows
        .filter((r) => indexFree(r.path) === q.path)
        .slice(0, limit)
        .map((r) => r.row as unknown as Observation);
    }

    const rows = await this.prisma.observation.findMany({
      where: {
        ...base,
        ...(q.code ? { code: q.code, ...(q.system ? { codeSystem: q.system } : {}) } : {}),
      },
      orderBy,
      take: limit,
      select: { row: true },
    });
    return rows.map((r) => r.row as unknown as Observation);
  }

  /**
   * Everything charted for a patient on one form — the flowsheet's input. The
   * caller (web) builds the grid with form-core's `buildFlowsheet` against the
   * form's current version, which is returned alongside.
   */
  async flowsheet(
    tenantId: string,
    patientMrn: string,
    formId: string,
    opts: { from?: Date; to?: Date; limit?: number },
  ): Promise<{ definition: DefinitionSchemas | null; observations: Observation[] }> {
    const form = await this.prisma.form.findFirst({
      where: { id: formId, tenantId },
      select: { currentVersion: { select: { dataSchema: true, uiSchema: true } } },
    });
    const observations = await this.forPatient(tenantId, patientMrn, {
      formId,
      from: opts.from,
      to: opts.to,
      limit: Math.min(opts.limit ?? MAX_LIMIT, MAX_LIMIT),
    });
    return {
      definition: form?.currentVersion
        ? { dataSchema: form.currentVersion.dataSchema, uiSchema: form.currentVersion.uiSchema }
        : null,
      observations,
    };
  }

  private toRow(submission: ProjectableSubmission, row: Observation): Prisma.ObservationCreateManyInput {
    const primary = row.coding?.[0];
    return {
      tenantId: submission.tenantId,
      submissionId: submission.id,
      formId: submission.formId,
      formVersionId: submission.formVersionId,
      patientMrn: submission.patientMrn,
      encounterId: submission.encounterId,
      path: row.path.slice(0, 500),
      codeSystem: primary?.system ?? null,
      code: primary?.code ?? null,
      label: row.label.slice(0, 500),
      valueNum: typeof row.value === 'number' ? row.value : null,
      valueText: typeof row.value === 'string' ? row.value : null,
      valueBool: typeof row.value === 'boolean' ? row.value : null,
      unit: row.unit ?? null,
      effectiveAt: new Date(row.effectiveAt),
      row: row as unknown as Prisma.InputJsonValue,
    };
  }
}

function indexFree(path: string): string {
  return path
    .split('.')
    .filter((s) => s.length > 0 && !/^\d+$/.test(s))
    .join('.');
}
