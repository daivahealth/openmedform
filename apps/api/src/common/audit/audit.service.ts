import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Central audit logger. The `audit_log` table existed from day one but nothing
 * wrote to it (tracked as issue #1); this service closes that gap.
 *
 * Auditing must never break the audited operation: a failure to write the log
 * is logged and swallowed rather than propagated, so a transient logging error
 * cannot roll back a clinical form submission. Call it AFTER the primary write
 * commits.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId ?? null,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for ${entry.action} ${entry.resourceType}:${entry.resourceId ?? '-'}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
