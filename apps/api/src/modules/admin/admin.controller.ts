import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService, type UsageGroupBy } from './admin.service';

const USAGE_GROUP_BY: UsageGroupBy[] = ['user', 'form', 'tenant', 'provider'];

/**
 * Operator console endpoints. Restricted to SUPER_ADMIN by the global
 * RolesGuard via @Roles; a tenant admin or lower receives 403.
 */
@Controller('admin')
@Roles('SUPER_ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  getStats() {
    return this.admin.getStats();
  }

  /**
   * Token spend grouped by user / form / tenant / provider, optionally windowed
   * by date. `form` is the per-form view enabled by ai_usage.form_id.
   */
  @Get('usage')
  getUsage(
    @Query('groupBy') groupBy = 'user',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!USAGE_GROUP_BY.includes(groupBy as UsageGroupBy)) {
      throw new BadRequestException(
        `groupBy must be one of: ${USAGE_GROUP_BY.join(', ')}`,
      );
    }
    return this.admin.getUsage({
      groupBy: groupBy as UsageGroupBy,
      from: parseDate(from, 'from'),
      to: parseDate(to, 'to'),
    });
  }

  /**
   * Raise (or reset, with null) a user's form creation quota. Quotas are
   * enforced in FormService on every creation path.
   */
  @Patch('users/:userId/form-limit')
  updateFormLimit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: { formLimit: number | null },
  ) {
    const limit = body?.formLimit ?? null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 10000)) {
      throw new BadRequestException(
        'formLimit must be an integer between 1 and 10000, or null to reset to the default.',
      );
    }
    return this.admin.updateUserFormLimit(userId, limit);
  }
}

/** Parse an ISO date query param, rejecting garbage rather than silently ignoring it. */
function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`"${field}" must be an ISO date (e.g. 2026-07-01)`);
  }
  return date;
}
