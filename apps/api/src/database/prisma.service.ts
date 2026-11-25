import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Warm the connection pool — but never let an unreachable database stop the
   * process from booting.
   *
   * Prisma connects lazily on the first query regardless, so this is an
   * optimisation and not a prerequisite. While it was treated as one, an
   * unhandled `$connect()` rejection took down `onModuleInit`, which meant
   * Nest never bound the port: an instance cold-starting during a database
   * outage served nothing at all, `/api/health` included. An endpoint whose
   * job is to report "the database is unreachable" has to survive the
   * database being unreachable.
   *
   * It also means the API recovers on its own when the database comes back,
   * rather than needing every instance cycled.
   *
   * The trade-off, stated plainly: a wrong `DATABASE_URL` no longer fails the
   * deploy with a crash loop. It shows up as this ERROR and as a 503 from
   * `/api/health` — which is what a post-deploy smoke test should be hitting.
   */
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.error(
        'Could not reach the database at startup. Booting anyway — queries ' +
          'will retry lazily and /api/health will report 503 until it ' +
          'recovers.',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
