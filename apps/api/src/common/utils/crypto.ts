/**
 * Encryption for stored tenant LLM API keys.
 *
 * The cipher was already sound — AES-256-GCM, a fresh IV per message, the auth
 * tag verified on decrypt. What was not sound was the key:
 *
 *     Buffer.from(process.env.AI_ENCRYPTION_KEY.slice(0, 32), 'utf8')
 *
 * The first 32 *characters* of the env var became the AES-256 key. A printable
 * 32-character passphrase carries well under 256 bits, and the only check was
 * length. So the key is now DERIVED rather than sliced, and a caller supplying
 * real key material can hand it over directly with no derivation loss.
 *
 * COMPATIBILITY — anything already in the database was encrypted under the old
 * scheme, and losing it would mean every tenant silently losing their provider
 * credentials. Ciphertext is therefore versioned: new values carry a `v2.`
 * prefix, unprefixed values are read with the legacy key. Nothing needs to be
 * migrated for the system to keep working; `scripts/reencrypt-provider-keys.ts`
 * exists to retire the legacy key deliberately rather than by attrition.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const TAG_LENGTH = 16;

/** 12 bytes is the standard GCM nonce size. Legacy records used 16. */
const IV_LENGTH = 12;
const LEGACY_IV_LENGTH = 16;

/** Marks a record written by the current scheme. */
const V2_PREFIX = 'v2.';

/**
 * Fixed application salt. A per-record salt would mean paying scrypt's cost on
 * every single decrypt, which is the wrong trade here: the salt exists to stop
 * precomputation being shared across deployments, not to separate many
 * low-entropy user passwords. The derived key is computed once and cached.
 */
const KDF_SALT = Buffer.from('openmedform/ai-provider-key/v2', 'utf8');

/**
 * The placeholder docker-compose used to default to. It is published in this
 * repository, so a deployment running on it has no encryption at all — refuse
 * to start rather than pretend otherwise.
 */
const KNOWN_INSECURE_KEYS = new Set([
  'default-dev-encryption-key-change-in-prod',
  'changeme',
  'change-me',
]);

let cachedKey: { source: string; key: Buffer } | undefined;
let cachedLegacyKey: { source: string; key: Buffer } | undefined;

function rawSecret(): string {
  const key = process.env.AI_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      'AI_ENCRYPTION_KEY must be set (at least 32 characters) to store provider API keys',
    );
  }
  if (KNOWN_INSECURE_KEYS.has(key.trim().toLowerCase())) {
    throw new Error(
      'AI_ENCRYPTION_KEY is set to a known placeholder value that is published in the ' +
        'OpenMedForm repository. Generate a real one — `openssl rand -hex 32` — and store it ' +
        'as a secret. Any provider key already encrypted under the placeholder should be ' +
        'treated as compromised and re-entered.',
    );
  }
  return key;
}

/** 32 bytes of real key material if the operator supplied some, else null. */
function decodeKeyMaterial(secret: string): Buffer | null {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
  if (/^[A-Za-z0-9+/]{43}=$/.test(secret)) {
    const buf = Buffer.from(secret, 'base64');
    if (buf.length === KEY_BYTES) return buf;
  }
  return null;
}

/**
 * The current key.
 *
 * A 32-byte hex or base64 secret is used as-is — that is full-entropy key
 * material and running it through a KDF would only discard information.
 * Anything else is treated as a passphrase and stretched with scrypt.
 */
function currentKey(): Buffer {
  const secret = rawSecret();
  if (cachedKey?.source === secret) return cachedKey.key;

  const material = decodeKeyMaterial(secret);
  const key = material ?? scryptSync(secret, KDF_SALT, KEY_BYTES);
  cachedKey = { source: secret, key };
  return key;
}

/** The pre-v2 key. Read-only: never used to encrypt anything new. */
function legacyKey(): Buffer {
  const secret = rawSecret();
  if (cachedLegacyKey?.source === secret) return cachedLegacyKey.key;
  const key = Buffer.from(secret.slice(0, KEY_BYTES), 'utf8');
  cachedLegacyKey = { source: secret, key };
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, currentKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return V2_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function open(payload: string, ivLength: number, key: Buffer): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, ivLength);
  const tag = buf.subarray(ivLength, ivLength + TAG_LENGTH);
  const encrypted = buf.subarray(ivLength + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function decrypt(ciphertext: string): string {
  if (ciphertext.startsWith(V2_PREFIX)) {
    return open(ciphertext.slice(V2_PREFIX.length), IV_LENGTH, currentKey());
  }
  // Written before the key was derived. Still readable so that upgrading does
  // not wipe every tenant's stored credentials.
  return open(ciphertext, LEGACY_IV_LENGTH, legacyKey());
}

/** True for a record still encrypted under the pre-derivation key. */
export function isLegacyCiphertext(ciphertext: string): boolean {
  return !ciphertext.startsWith(V2_PREFIX);
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
