/**
 * Rebuild the `observation` read model from existing submissions (ADR-005).
 *
 * Idempotent: each submission's rows are deleted and re-inserted, so run it
 * after deploying the table, after changing the projection, or any time the
 * table is suspected stale. Voided and in-progress submissions are skipped;
 * a submission with no `effective_at` gets one (from its flagged field, else
 * `created_at`) so history sorts have a value.
 *
 *   cd apps/api && npx tsx scripts/backfill-observations.ts [--tenant <uuid>] [--batch 200]
 */

import { PrismaClient } from '@prisma/client';
import { ObservationService } from '../src/modules/observation/observation.service';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const tenantId = arg('--tenant');
  const batch = Number(arg('--batch') ?? 200);
  const service = new ObservationService(prisma as never);

  let cursor: string | undefined;
  let done = 0;
  let rows = 0;
  for (;;) {
    const page = await prisma.submission.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { in: ['COMPLETED', 'SIGNED', 'AMENDED'] },
      },
      orderBy: { id: 'asc' },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        formVersion: { select: { dataSchema: true, uiSchema: true, version: true } },
        submittedBy: { select: { fullName: true } },
      },
    });
    if (page.length === 0) break;

    for (const s of page) {
      const effectiveAt = service.resolveEffectiveAt(s);
      if (!s.effectiveAt) {
        await prisma.submission.update({ where: { id: s.id }, data: { effectiveAt } });
      }
      const written = await service.replaceForSubmission({ ...s, effectiveAt });
      rows += written.length;
      done += 1;
    }
    cursor = page[page.length - 1].id;
    console.log(`… ${done} submissions, ${rows} observations`);
  }
  console.log(`Backfill complete: ${done} submissions → ${rows} observations.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
