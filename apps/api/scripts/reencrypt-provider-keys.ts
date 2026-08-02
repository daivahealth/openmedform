/**
 * Re-encrypt stored provider API keys under the current key scheme.
 *
 * Records written before the key was derived (see common/utils/crypto.ts) are
 * still readable, so nothing breaks without this. What it buys is retiring the
 * old raw-slice key deliberately, rather than waiting for every tenant to
 * happen to re-enter their credentials.
 *
 * Run it with the SAME AI_ENCRYPTION_KEY the legacy records were written under
 * — this migrates the derivation, not the secret. Rotating the secret itself is
 * a different operation and cannot be done here: the old ciphertext would be
 * unreadable, and tenants must re-enter their keys.
 *
 *   AI_ENCRYPTION_KEY=... DATABASE_URL=... npx tsx scripts/reencrypt-provider-keys.ts
 *   # add --dry-run to report without writing
 *
 * Safe to re-run: v2 records are skipped.
 */

import { PrismaClient } from '@prisma/client';
import { decrypt, encrypt, isLegacyCiphertext, maskApiKey } from '../src/common/utils/crypto';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  try {
    const configs = await prisma.aiProviderConfig.findMany({
      select: { id: true, tenantId: true, provider: true, apiKey: true },
    });

    const legacy = configs.filter((c) => isLegacyCiphertext(c.apiKey));
    console.log(
      `${configs.length} provider config(s); ${legacy.length} still on the legacy key` +
        (dryRun ? ' (dry run — nothing will be written)' : ''),
    );
    if (legacy.length === 0) return;

    let migrated = 0;
    const failures: string[] = [];

    for (const config of legacy) {
      let plaintext: string;
      try {
        plaintext = decrypt(config.apiKey);
      } catch (err) {
        // Almost always means this row was written under a DIFFERENT secret.
        // Reported and skipped: overwriting it would destroy the only copy.
        failures.push(
          `${config.provider} (tenant ${config.tenantId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }

      // Prove the new record reads back before writing it.
      const resealed = encrypt(plaintext);
      if (decrypt(resealed) !== plaintext) {
        failures.push(`${config.provider} (tenant ${config.tenantId}): round-trip check failed`);
        continue;
      }

      if (!dryRun) {
        await prisma.aiProviderConfig.update({
          where: { id: config.id },
          data: { apiKey: resealed },
        });
      }
      migrated++;
      console.log(`  ${dryRun ? 'would migrate' : 'migrated'} ${config.provider} ${maskApiKey(plaintext)}`);
    }

    console.log(`\n${migrated} migrated, ${failures.length} skipped`);
    if (failures.length > 0) {
      console.error(
        '\nThese could not be decrypted and were left untouched — they were most likely\n' +
          'written under a different AI_ENCRYPTION_KEY. Those tenants must re-enter their\n' +
          'provider keys in Settings → AI Providers:\n  ' +
          failures.join('\n  '),
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
