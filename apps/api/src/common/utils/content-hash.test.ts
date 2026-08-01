import { describe, it, expect } from 'vitest';
import { canonicalJson, contentHash, verifyContentHash } from './content-hash';

describe('content-hash', () => {
  it('is stable regardless of object key order', () => {
    const a = { engine: 'JSONFORMS', dataSchema: { type: 'object', title: 'x' } };
    const b = { dataSchema: { title: 'x', type: 'object' }, engine: 'JSONFORMS' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('changes when content changes', () => {
    const base = contentHash({ engine: 'JSONFORMS', dataSchema: { a: 1 } });
    expect(contentHash({ engine: 'JSONFORMS', dataSchema: { a: 2 } })).not.toBe(base);
  });

  it('produces a 64-char hex sha-256 digest', () => {
    expect(contentHash({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifyContentHash detects tampering', () => {
    const payload = { engine: 'JSONFORMS', dataSchema: { type: 'object' } };
    const hash = contentHash(payload);
    expect(verifyContentHash(payload, hash)).toBe(true);
    const tampered = { engine: 'JSONFORMS', dataSchema: { type: 'string' } };
    expect(verifyContentHash(tampered, hash)).toBe(false);
  });
});
