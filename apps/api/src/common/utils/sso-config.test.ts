import { describe, expect, it } from 'vitest';

import { isSsoCredentialConfigured } from './sso-config';

describe('isSsoCredentialConfigured', () => {
  it('accepts real client ids from both providers', () => {
    // Microsoft: a GUID. Google: <numeric>-<hash>.apps.googleusercontent.com.
    expect(
      isSsoCredentialConfigured('3f2b8c1a-7d4e-4a91-b0c5-1e6f8a2d9b47'),
    ).toBe(true);
    expect(
      isSsoCredentialConfigured(
        '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com',
      ),
    ).toBe(true);
  });

  it('accepts a client secret with punctuation but no whitespace', () => {
    expect(isSsoCredentialConfigured('Xy7~q.8Z_-aB3cD4eF5gH6iJ7kL8mN9o')).toBe(
      true,
    );
  });

  it('rejects an absent value', () => {
    expect(isSsoCredentialConfigured(undefined)).toBe(false);
    expect(isSsoCredentialConfigured('')).toBe(false);
    expect(isSsoCredentialConfigured('   ')).toBe(false);
  });

  it('rejects the CHANGE_ME placeholder scripts/gcp-setup.sh seeds', () => {
    expect(isSsoCredentialConfigured('CHANGE_ME')).toBe(false);
    expect(isSsoCredentialConfigured('  CHANGE_ME  ')).toBe(false);
  });

  it('rejects an angle-bracket instruction copied verbatim', () => {
    // Both of these were stored in Secret Manager for real.
    expect(
      isSsoCredentialConfigured('<Application (client) ID from step 1>'),
    ).toBe(false);
    expect(isSsoCredentialConfigured('<client secret Value from step 3>')).toBe(
      false,
    );
  });

  it('rejects a shell command pasted into a waiting prompt', () => {
    expect(
      isSsoCredentialConfigured(
        'gcloud secrets versions access latest --secret=MICROSOFT_CLIENT_ID | grep -Eq ... && echo ok',
      ),
    ).toBe(false);
  });

  it('rejects a value carrying a stray newline or space', () => {
    // `echo` instead of `printf` is the usual source of the trailing newline;
    // the provider would reject the credential with an opaque error.
    expect(
      isSsoCredentialConfigured('3f2b8c1a-7d4e-4a91-b0c5-1e6f8a2d9b47\n'),
    ).toBe(true); // trimmed away — harmless
    expect(
      isSsoCredentialConfigured('3f2b8c1a-7d4e 4a91-b0c5-1e6f8a2d9b47'),
    ).toBe(false); // interior whitespace is never legitimate
  });
});
