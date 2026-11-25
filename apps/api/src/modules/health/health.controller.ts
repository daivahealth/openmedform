import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';

// Exempt: the platform's own liveness probes hit this on a timer, and a
// throttled health check reads as an outage.
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Readiness: can this instance actually serve a request?
   *
   * It used to answer a hardcoded `{ status: 'ok' }`, which meant it kept
   * reporting a healthy service through a 13-day outage in which every
   * database-backed route — sign-in included — was returning 500. A health
   * check that cannot fail is not a health check.
   *
   * `findFirst` on tenants rather than `SELECT 1`, because the repo bans raw
   * SQL outside migrations and seeds. It costs a `LIMIT 1`, so it stays
   * constant-time however large the table gets, and it proves the whole path:
   * connection, credentials, and that the schema is readable. An empty table
   * is a pass — we are testing reachability, not content.
   */
  @Public()
  @Get()
  async check() {
    const timestamp = new Date().toISOString();
    try {
      await this.prisma.tenant.findFirst({ select: { id: true } });
    } catch (err) {
      // The cause belongs in the logs, not in the response body: this
      // endpoint is unauthenticated and public, and a driver error can name
      // the host and user it failed to connect as.
      this.logger.error(
        'Health check failed: the database is unreachable',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        timestamp,
      });
    }

    return {
      status: 'ok',
      database: 'ok',
      timestamp,
    };
  }

  /**
   * Liveness: is the process up? Deliberately dependency-free.
   *
   * Point container liveness probes here, never at `/api/health`. A probe
   * that restarts the instance whenever the database blips turns a brief
   * upstream outage into a crash loop, and restarting the API has never once
   * fixed Postgres.
   */
  @Public()
  @Get('live')
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
