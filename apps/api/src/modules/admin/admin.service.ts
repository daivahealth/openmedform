import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
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
        isActive: t.isActive,
        createdAt: t.createdAt,
        users: usersCountMap.get(t.id) ?? 0,
        forms: formsCountMap.get(t.id) ?? 0,
        submissions: submissionsCountMap.get(t.id) ?? 0,
        totalTokens: tokensTenantMap.get(t.id) ?? 0,
      })),
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
