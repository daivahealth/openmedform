import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCipheriv, randomBytes } from 'crypto';

import { decrypt, encrypt, isLegacyCiphertext, maskApiKey } from './crypto';

const PASSPHRASE = 'a-perfectly-ordinary-32char-passphrase';
const HEX_KEY = 'a'.repeat(64);

const original = process.env.AI_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.AI_ENCRYPTION_KEY = PASSPHRASE;
});
afterEach(() => {
  process.env.AI_ENCRYPTION_KEY = original;
});

/** Exactly how the pre-v2 code wrote a record: raw 32-char slice, 16-byte IV. */
function legacyEncrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(secret.slice(0, 32), 'utf8'), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

describe('encrypt / decrypt', () => {
  it('round-trips a provider key', () => {
    expect(decrypt(encrypt('sk-secret-value'))).toBe('sk-secret-value');
  });

  it('marks new records so their key scheme is unambiguous', () => {
    expect(encrypt('x').startsWith('v2.')).toBe(true);
    expect(isLegacyCiphertext(encrypt('x'))).toBe(false);
  });

  it('uses a fresh IV per record', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('rejects a tampered record rather than returning garbage', () => {
    // GCM's auth tag is the whole point: a modified ciphertext must fail.
    const sealed = encrypt('sk-secret-value');
    const body = Buffer.from(sealed.slice(3), 'base64');
    body[body.length - 1] ^= 0xff;
    expect(() => decrypt('v2.' + body.toString('base64'))).toThrow();
  });
});

describe('reading records written before the key was derived', () => {
  // Losing these would mean every tenant silently losing their credentials on
  // deploy, so this is the test that matters most in this file.
  it('still decrypts a legacy record', () => {
    const legacy = legacyEncrypt('sk-old-value', PASSPHRASE);

    expect(isLegacyCiphertext(legacy)).toBe(true);
    expect(decrypt(legacy)).toBe('sk-old-value');
  });

  it('re-encrypting a legacy record produces a v2 record with the same value', () => {
    const legacy = legacyEncrypt('sk-old-value', PASSPHRASE);

    const migrated = encrypt(decrypt(legacy));

    expect(isLegacyCiphertext(migrated)).toBe(false);
    expect(decrypt(migrated)).toBe('sk-old-value');
  });
});

describe('key material', () => {
  it('uses a 64-char hex secret directly, without derivation loss', () => {
    process.env.AI_ENCRYPTION_KEY = HEX_KEY;
    expect(decrypt(encrypt('sk-x'))).toBe('sk-x');
  });

  it('accepts a 32-byte base64 secret', () => {
    process.env.AI_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(decrypt(encrypt('sk-x'))).toBe('sk-x');
  });

  it('derives different keys from different passphrases', () => {
    const sealed = encrypt('sk-x');
    process.env.AI_ENCRYPTION_KEY = 'a-completely-different-32char-passphrase';
    expect(() => decrypt(sealed)).toThrow();
  });

  it.each([
    ['missing', undefined],
    ['too short', 'short'],
  ])('refuses a %s key', (_label, value) => {
    if (value === undefined) delete process.env.AI_ENCRYPTION_KEY;
    else process.env.AI_ENCRYPTION_KEY = value;
    expect(() => encrypt('x')).toThrow(/AI_ENCRYPTION_KEY must be set/);
  });

  it('refuses the placeholder that is published in this repository', () => {
    // A deployment running on it has no encryption at all; failing to start is
    // the only honest response.
    process.env.AI_ENCRYPTION_KEY = 'default-dev-encryption-key-change-in-prod';
    expect(() => encrypt('x')).toThrow(/known placeholder/);
    expect(() => encrypt('x')).toThrow(/treated as compromised/);
  });
});

describe('maskApiKey', () => {
  it('shows only the ends of a real key', () => {
    expect(maskApiKey('sk-abcdefghijklmnop')).toBe('sk-a****mnop');
  });

  it('reveals nothing about a short value', () => {
    expect(maskApiKey('sk-12345')).toBe('****');
  });
});
