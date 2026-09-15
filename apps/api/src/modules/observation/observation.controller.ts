/**
 * Patient observation reads (ADR-005 §5). Same access as submission reads:
 * any authenticated user of the tenant (the global JwtAuthGuard applies; no
 * role gate, matching GET /submissions). Every query is tenant-scoped in the
 * service.
 */

import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { ObservationService } from './observation.service';

function optionalDate(value: string | undefined, name: string): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${name} must be an ISO-8601 date`);
  return d;
}

function optionalInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new BadRequestException(`${name} must be a positive integer`);
  return n;
}

function optionalUuid(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${name} must be a UUID`);
  }
  return value;
}

@Controller('patients/:mrn')
export class ObservationController {
  constructor(private readonly observations: ObservationService) {}

  /**
   * Prior readings, newest first — what a renderer's `historyProvider` asks
   * for: `?code=8867-4[&system=http://loinc.org]` or `?path=vitals.pulse`,
   * plus `limit`, and optionally `formId`, `from`, `to`.
   */
  @Get('observations')
  list(
    @CurrentUser() user: RequestUser,
    @Param('mrn') mrn: string,
    @Query('code') code?: string,
    @Query('system') system?: string,
    @Query('path') path?: string,
    @Query('formId') formId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    if (!code && !path) throw new BadRequestException('Provide code or path');
    return this.observations.forPatient(user.tenantId, mrn, {
      code: code || undefined,
      system: system || undefined,
      path: path || undefined,
      formId: optionalUuid(formId, 'formId'),
      from: optionalDate(from, 'from'),
      to: optionalDate(to, 'to'),
      limit: optionalInt(limit, 'limit'),
    });
  }

  /** Everything charted on one form for this patient, with the form's current schemas. */
  @Get('flowsheet')
  flowsheet(
    @CurrentUser() user: RequestUser,
    @Param('mrn') mrn: string,
    @Query('formId', ParseUUIDPipe) formId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.observations.flowsheet(user.tenantId, mrn, formId, {
      from: optionalDate(from, 'from'),
      to: optionalDate(to, 'to'),
      limit: optionalInt(limit, 'limit'),
    });
  }
}
