import { createHash } from 'node:crypto';

/**
 * Deterministic content hashing for published form versions.
 *
 * A published version is immutable; we store a SHA-256 of its canonical payload
 * at publish time so tampering (a direct DB edit that bypasses the service
 * layer) can be detected later via {@link verifyContentHash}. Canonicalization
 * sorts object keys recursively so semantically identical payloads always hash
 * the same regardless of key order.
 */

/** Recursively sort object keys to produce a stable JSON string. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON string for a value (stable across key ordering). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value) ?? null);
}

/** SHA-256 (hex) of a value's canonical JSON form. */
export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** True when `value` still hashes to `expected` (integrity check). */
export function verifyContentHash(value: unknown, expected: string): boolean {
  return contentHash(value) === expected;
}
