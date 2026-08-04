import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/** The ai_usage column each usage `groupBy` dimension aggregates on. */
const USAGE_GROUP_COLUMNS = {
  user: 'userId',
  form: 'formId',
  tenant: 'tenantId',
  provider: 'provider',
  operation: 'operation',
} as const;

export type UsageGroupBy = keyof typeof USAGE_GROUP_COLUMNS;

function groupByColumn(groupBy: UsageGroupBy) {
  return USAGE_GROUP_COLUMNS[groupBy];
}

/** Shape Prisma's groupBy returns for the usage query. */
interface UsageGroupRow {
  userId?: string | null;
  formId?: string | null;
  tenantId?: string | null;
  provider?: string | null;
  operation?: string | null;
  _count: { _all: number };
  _sum: {
    totalTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  _max: { createdAt: Date | null };
}

export interface UsageRow {
  key: string | null;
  label: string;
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  lastUsedAt: Date | null;
  /**
   * Median and p95 of OUTPUT tokens per call — only on the `operation`
   * dimension, where they answer the sizing questions the cost work needs
   * (issue #128): how big is a typical refine's re-emission, and how bad is
   * the tail? Output tokens because they are the expensive and slow ones.
   */
  outputP50?: number;
  outputP95?: number;
}

/**
 * Platform-wide analytics for the SUPER_ADMIN console: who signed up, who
 * logged in, how many forms each tenant/user built, and how many LLM tokens
 * they consumed. Reads the operational `ai_usage` and `audit_log` tables
 * populated by AiUsageService and AuditService.
 *
 * This is deliberately cross-tenant (an operator view), so it is NOT scoped by
 * tenant_id the way domain queries are — access is gated to SUPER_ADMIN at the
 * controller.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      tenantCount,
      userCount,
      formCount,
      submissionCount,
      generationCount,
      tokenTotals,
      tenants,
      usersByTenant,
      formsByTenant,
      submissionsByTenant,
      tokensByTenant,
      users,
      formsByCreator,
      tokensByUser,
      usageByProvider,
      recentLoginRows,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.form.count(),
      this.prisma.submission.count(),
      this.prisma.aiUsage.count(),
      this.prisma.aiUsage.aggregate({
        _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      }),
      this.prisma.tenant.findMany({
        select: { id: true, name: true, slug: true, country: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } }),
      this.prisma.form.groupBy({ by: ['tenantId'], _count: { _all: true } }),
      this.prisma.submission.groupBy({ by: ['tenantId'], _count: { _all: true } }),
      this.prisma.aiUsage.groupBy({ by: ['tenantId'], _sum: { totalTokens: true } }),
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          tenant: { select: { name: true } },
          formLimit: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.form.groupBy({ by: ['createdById'], _count: { _all: true } }),
      this.prisma.aiUsage.groupBy({ by: ['userId'], _sum: { totalTokens: true } }),
      this.prisma.aiUsage.groupBy({
        by: ['provider'],
        _count: { _all: true },
        _sum: { totalTokens: true },
      }),
      this.prisma.auditLog.findMany({
        where: { action: 'auth.login' },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { userId: true, details: true, ipAddress: true, createdAt: true },
      }),
    ]);

    const usersCountMap = toMap(usersByTenant, (r) => r.tenantId, (r) => r._count._all);
    const formsCountMap = toMap(formsByTenant, (r) => r.tenantId, (r) => r._count._all);
    const submissionsCountMap = toMap(submissionsByTenant, (r) => r.tenantId, (r) => r._count._all);
    const tokensTenantMap = toMap(tokensByTenant, (r) => r.tenantId, (r) => r._sum.totalTokens ?? 0);
    const formsCreatorMap = toMap(formsByCreator, (r) => r.createdById, (r) => r._count._all);
    const tokensUserMap = toMap(
      tokensByUser,
      (r) => r.userId ?? '',
      (r) => r._sum.totalTokens ?? 0,
    );

    return {
      totals: {
        tenants: tenantCount,
        users: userCount,
        forms: formCount,
        submissions: submissionCount,
        aiGenerations: generationCount,
        totalTokens: tokenTotals._sum.totalTokens ?? 0,
        inputTokens: tokenTotals._sum.inputTokens ?? 0,
        outputTokens: tokenTotals._sum.outputTokens ?? 0,
      },
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        country: t.country,
        isActive: t.isActive,
        createdAt: t.createdAt,
        users: usersCountMap.get(t.id) ?? 0,
        forms: formsCountMap.get(t.id) ?? 0,
        submissions: submissionsCountMap.get(t.id) ?? 0,
        totalTokens: tokensTenantMap.get(t.id) ?? 0,
      })),
      usersByCountry: aggregateUsersByCountry(tenants, usersCountMap),
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
        tenantName: u.tenant.name,
        formLimit: u.formLimit,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        formsCreated: formsCreatorMap.get(u.id) ?? 0,
        totalTokens: tokensUserMap.get(u.id) ?? 0,
      })),
      usageByProvider: usageByProvider.map((p) => ({
        provider: p.provider,
        generations: p._count._all,
        totalTokens: p._sum.totalTokens ?? 0,
      })),
      recentLogins: recentLoginRows.map((r) => {
        const details = (r.details ?? {}) as { email?: string; method?: string };
        return {
          email: details.email ?? null,
          method: details.method ?? null,
          ipAddress: r.ipAddress,
          at: r.createdAt,
        };
      }),
    };
  }
  /**
   * Token spend grouped along one dimension, for the operator usage console.
   * `form` is the dimension `ai_usage` gained a `form_id` for; rows with a null
   * form_id (a create run that never produced a form, or usage recorded before
   * attribution existed) are surfaced explicitly as "Unattributed" rather than
   * dropped, so the grouped totals always reconcile with the platform total.
   */
  async getUsage(params: {
    groupBy: UsageGroupBy;
    from?: Date;
    to?: Date;
  }) {
    const { groupBy, from, to } = params;
    const where =
      from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {};

    // Prisma derives groupBy's return type from a LITERAL `by` tuple, which a
    // runtime-chosen column can't satisfy. Narrow the delegate to the call we
    // actually make; the row shape is pinned by UsageGroupRow, and groupBy is
    // only ever reached with one of the four USAGE_GROUP_COLUMNS values.
    const usageDelegate = this.prisma.aiUsage as unknown as {
      groupBy(args: Record<string, unknown>): Promise<UsageGroupRow[]>;
    };
    const groupByRows = usageDelegate.groupBy({
      by: [groupByColumn(groupBy)],
      where,
      _count: { _all: true },
      _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      _max: { createdAt: true },
    });

    const [totals, rows] = await Promise.all([
      this.prisma.aiUsage.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      }),
      groupByRows,
    ]);

    let labelled = await this.labelUsageRows(groupBy, rows);
    if (groupBy === 'operation') {
      labelled = await this.attachOutputPercentiles(labelled, where);
    }

    return {
      groupBy,
      from: from ?? null,
      to: to ?? null,
      totals: {
        calls: totals._count._all,
        totalTokens: totals._sum.totalTokens ?? 0,
        inputTokens: totals._sum.inputTokens ?? 0,
        outputTokens: totals._sum.outputTokens ?? 0,
      },
      rows: labelled.sort((a, b) => b.totalTokens - a.totalTokens),
    };
  }

  /**
   * p50/p95 of output tokens per call for each operation. Computed in JS over
   * the windowed rows rather than SQL percentile_cont — Prisma cannot express
   * it and the repo rule is no raw SQL outside migrations. Volume makes this
   * fine: each row is one small int, and even a busy month is a few thousand
   * AI calls. `take` bounds the pathological case; if it is ever hit, the
   * percentiles describe the most recent slice rather than exploding memory.
   */
  private async attachOutputPercentiles(
    rows: UsageRow[],
    where: Record<string, unknown>,
  ): Promise<UsageRow[]> {
    const samples = await this.prisma.aiUsage.findMany({
      where,
      select: { operation: true, outputTokens: true },
      orderBy: { id: 'desc' },
      take: 50_000,
    });

    const byOperation = new Map<string, number[]>();
    for (const s of samples) {
      const list = byOperation.get(s.operation) ?? [];
      list.push(s.outputTokens);
      byOperation.set(s.operation, list);
    }

    const percentile = (sorted: number[], p: number) =>
      sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

    return rows.map((row) => {
      const values = (byOperation.get(row.key ?? '') ?? []).sort((a, b) => a - b);
      if (values.length === 0) return row;
      return {
        ...row,
        outputP50: percentile(values, 50),
        outputP95: percentile(values, 95),
      };
    });
  }

  /** Resolve each group key to a human-readable name in one batched query. */
  private async labelUsageRows(
    groupBy: UsageGroupBy,
    rows: UsageGroupRow[],
  ): Promise<UsageRow[]> {
    const column = groupByColumn(groupBy);
    const keys = rows
      .map((r) => r[column] as string | null)
      .filter((k): k is string => !!k);

    const names = new Map<string, string>();
    if (groupBy === 'user' && keys.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: keys } },
        select: { id: true, fullName: true, email: true },
      });
      users.forEach((u) => names.set(u.id, `${u.fullName} (${u.email})`));
    } else if (groupBy === 'form' && keys.length) {
      const forms = await this.prisma.form.findMany({
        where: { id: { in: keys } },
        select: { id: true, name: true },
      });
      forms.forEach((f) => names.set(f.id, f.name));
    } else if (groupBy === 'tenant' && keys.length) {
      const tenants = await this.prisma.tenant.findMany({
        where: { id: { in: keys } },
        select: { id: true, name: true },
      });
      tenants.forEach((t) => names.set(t.id, t.name));
    }

    return rows.map((r) => {
      const key = (r[column] as string | null) ?? null;
      return {
        key,
        // A deleted form/user keeps its usage history but loses its name.
        label:
          key === null
            ? 'Unattributed'
            : groupBy === 'provider' || groupBy === 'operation'
              ? key
              : (names.get(key) ?? '(deleted)'),
        calls: r._count._all,
        totalTokens: r._sum.totalTokens ?? 0,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        lastUsedAt: r._max.createdAt ?? null,
      };
    });
  }

  async updateUserFormLimit(userId: string, formLimit: number | null) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { formLimit },
      select: { id: true, email: true, formLimit: true },
    });
    return user;
  }
}

function toMap<T, V>(
  rows: T[],
  key: (r: T) => string,
  value: (r: T) => V,
): Map<string, V> {
  const map = new Map<string, V>();
  for (const r of rows) map.set(key(r), value(r));
  return map;
}

/** Country-wise user counts, derived from each tenant's country and its
 *  per-tenant user count. Tenants predating the country column (or without
 *  one) bucket under 'Unknown'. Sorted by count desc. */
function aggregateUsersByCountry(
  tenants: { id: string; country: string | null }[],
  usersCountMap: Map<string, number>,
): { country: string; users: number }[] {
  const byCountry = new Map<string, number>();
  for (const t of tenants) {
    const country = t.country ?? 'Unknown';
    byCountry.set(
      country,
      (byCountry.get(country) ?? 0) + (usersCountMap.get(t.id) ?? 0),
    );
  }
  return [...byCountry.entries()]
    .map(([country, users]) => ({ country, users }))
    .sort((a, b) => b.users - a.users || a.country.localeCompare(b.country));
}
