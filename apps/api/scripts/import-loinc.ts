/**
 * Load the official LOINC table into loinc_code (#135).
 *
 *   npx tsx scripts/import-loinc.ts /path/to/Loinc.csv
 *
 * Get Loinc.csv from the "LOINC Table File (CSV)" release at https://loinc.org
 * (free account; you accept the license there — which is also why this repo
 * cannot ship the table itself). Re-running upserts, so a new LOINC release
 * loads over the old one.
 *
 * Only the columns search needs are kept: code, component, names, and
 * RELATEDNAMES2 — the synonym column that lets "SpO2" find "Oxygen
 * saturation". Attribution: this material contains content from LOINC
 * (https://loinc.org), copyright Regenstrief Institute, Inc. and the LOINC
 * Committee, available at no cost under the license at
 * https://loinc.org/license.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';

const BATCH = 500;
/** relatedNames is search-only; cap the fat tail so rows stay small. */
const RELATED_MAX = 2000;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/import-loinc.ts /path/to/Loinc.csv');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });

  let header: string[] | null = null;
  let idx: Record<string, number> = {};
  let batch: Array<{
    code: string;
    component: string;
    longCommonName: string;
    shortName: string | null;
    relatedNames: string | null;
    class: string | null;
  }> = [];
  let total = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.$transaction(
      batch.map((row) =>
        prisma.loincCode.upsert({ where: { code: row.code }, create: row, update: row }),
      ),
    );
    total += batch.length;
    if (total % 10_000 < BATCH) console.log(`${total} codes loaded...`);
    batch = [];
  };

  for await (const line of rl) {
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells;
      idx = Object.fromEntries(header.map((h, i) => [h.toUpperCase(), i]));
      for (const required of ['LOINC_NUM', 'COMPONENT', 'LONG_COMMON_NAME']) {
        if (!(required in idx)) {
          console.error(`Column ${required} not found — is this the LOINC Table CSV?`);
          process.exit(1);
        }
      }
      continue;
    }
    const code = cells[idx.LOINC_NUM]?.trim();
    const component = cells[idx.COMPONENT]?.trim();
    const longCommonName = cells[idx.LONG_COMMON_NAME]?.trim();
    if (!code || !component || !longCommonName) continue;

    batch.push({
      code: code.slice(0, 20),
      component: component.slice(0, 255),
      longCommonName: longCommonName.slice(0, 500),
      shortName: cells[idx.SHORTNAME]?.trim().slice(0, 255) || null,
      relatedNames: cells[idx.RELATEDNAMES2]?.trim().slice(0, RELATED_MAX) || null,
      class: cells[idx.CLASS]?.trim().slice(0, 100) || null,
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.log(`Done: ${total} LOINC codes loaded.`);
  await prisma.$disconnect();
}

/** Minimal RFC 4180 line parser (quoted cells, doubled quotes). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

void main();
