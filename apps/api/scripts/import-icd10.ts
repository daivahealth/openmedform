/**
 * Load ICD-10-CM codes into icd10_code (#136).
 *
 *   npx tsx scripts/import-icd10.ts /path/to/icd10cm_order_2026.txt
 *
 * Source: the CMS "ICD-10-CM Order File" (public domain), from
 * https://www.cms.gov/medicare/coding-billing/icd-10-codes — a fixed-width
 * file: order number, code, header/billable flag, short description, long
 * description. The dot is restored (E119 → E11.9) because that is how codes
 * are written on forms and in FHIR.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';

const BATCH = 500;

/** Fixed-width columns per the CMS order-file layout. */
function parseLine(line: string): { code: string; billable: boolean; short: string; long: string } | null {
  if (line.length < 78) return null;
  const rawCode = line.slice(6, 13).trim();
  if (!rawCode) return null;
  const billable = line.slice(14, 15).trim() === '1';
  const short = line.slice(16, 76).trim();
  const long = line.slice(77).trim();
  const code = rawCode.length > 3 ? `${rawCode.slice(0, 3)}.${rawCode.slice(3)}` : rawCode;
  return { code, billable, short, long };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/import-icd10.ts /path/to/icd10cm_order_YYYY.txt');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });

  let batch: Array<{ code: string; title: string; shortName: string | null; billable: boolean }> = [];
  let total = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.$transaction(
      batch.map((row) =>
        prisma.icd10Code.upsert({ where: { code: row.code }, create: row, update: row }),
      ),
    );
    total += batch.length;
    if (total % 10_000 < BATCH) console.log(`${total} codes loaded...`);
    batch = [];
  };

  for await (const line of rl) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    batch.push({
      code: parsed.code.slice(0, 10),
      title: (parsed.long || parsed.short).slice(0, 500),
      shortName: parsed.short.slice(0, 255) || null,
      billable: parsed.billable,
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.log(`Done: ${total} ICD-10-CM codes loaded.`);
  await prisma.$disconnect();
}

void main();
