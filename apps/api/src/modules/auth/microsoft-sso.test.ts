import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

import { MicrosoftStrategy } from './microsoft.strategy';
import { decodeOauthState } from './oauth-state';

const CONFIG = {
  getOrThrow: (k: string) => `value-for-${k}`,
  get: (k: string, d?: string) => d,
} as never;

function strategy(resolve = vi.fn().mockResolvedValue({ id: 'u1' })) {
  const svc = { resolveSsoUser: resolve } as never;
  return { s: new MicrosoftStrategy(CONFIG, svc), resolve };
}

const req = { query: {}, ip: '127.0.0.1' } as never;

/**
 * Azure offers two email-shaped values and only one is trustworthy. `mail` is
 * the mailbox the tenant assigned; `userPrincipalName` is a sign-in name that,
 * in a tenant you control, you can set to anything. Login matches an existing
 * user BY EMAIL, so accepting a UPN would be an account-takeover path.
 */
describe('Microsoft sign-in requires an organisational email', () => {
  it('signs in with the mail attribute', async () => {
    const { s, resolve } = strategy();
    const done = vi.fn();

    await s.validate(
      req,
      'at',
      'rt',
      { displayName: 'Jane', emails: [{ value: 'jane@hospital.org' }] } as never,
      done,
    );

    expect(resolve).toHaveBeenCalledWith(
      'microsoft',
      'jane@hospital.org',
      'Jane',
      'login',
      undefined,
      '127.0.0.1',
    );
    expect(done).toHaveBeenCalledWith(null, { id: 'u1' });
  });

  it('refuses a profile with no email rather than falling back to the UPN', async () => {
    const { s, resolve } = strategy();
    const done = vi.fn();

    // passport-microsoft only puts the UPN in `emails` when addUPNAsEmail is
    // on, which it deliberately is not — so this is what a UPN-only account
    // looks like here.
    await s.validate(req, 'at', 'rt', { displayName: 'Jane', emails: [] } as never, done);

    expect(resolve).not.toHaveBeenCalled();
    const [err] = done.mock.calls[0];
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toMatch(/no organisational email/i);
  });

  it('never enables addUPNAsEmail', () => {
    // A missing-email report is tempting to "fix" by turning this on. The whole
    // guarantee above rests on it staying off.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'microsoft.strategy.ts'),
      'utf8',
    ) as string;
    expect(source).not.toMatch(/addUPNAsEmail:\s*true/);
  });

  it('carries signup intent through the same state payload as Google', async () => {
    const { s, resolve } = strategy();
    const state = Buffer.from(
      JSON.stringify({ m: 's', o: 'St Mary Hospital', c: 'India' }),
    ).toString('base64url');

    await s.validate(
      { query: { state }, ip: '10.0.0.1' } as never,
      'at',
      'rt',
      { displayName: 'Admin', emails: [{ value: 'admin@stmary.org' }] } as never,
      vi.fn(),
    );

    expect(resolve).toHaveBeenCalledWith(
      'microsoft',
      'admin@stmary.org',
      'Admin',
      'signup',
      { organizationName: 'St Mary Hospital', country: 'India' },
      '10.0.0.1',
    );
  });

  it('reports a rejected sign-in through done(), not by throwing', async () => {
    // The caller is passport; a thrown error here would escape as a 500 rather
    // than reaching the redirect filter.
    const { s } = strategy(vi.fn().mockRejectedValue(new UnauthorizedException('nope')));
    const done = vi.fn();

    await expect(
      s.validate(req, 'at', 'rt', { emails: [{ value: 'x@y.org' }] } as never, done),
    ).resolves.toBeUndefined();
    expect(done.mock.calls[0][0]).toBeInstanceOf(UnauthorizedException);
  });
});

describe('the OAuth state payload is shared, not duplicated', () => {
  it('decodes what the guard encodes, for either provider', () => {
    const signup = Buffer.from(
      JSON.stringify({ m: 's', o: 'Acme Health', c: 'UK' }),
    ).toString('base64url');

    expect(decodeOauthState(signup)).toEqual({
      mode: 'signup',
      signup: { organizationName: 'Acme Health', country: 'UK' },
    });
    expect(decodeOauthState(Buffer.from(JSON.stringify({ m: 'l' })).toString('base64url')))
      .toEqual({ mode: 'login' });
  });

  it('degrades to login on anything unparseable', () => {
    for (const raw of [undefined, '', 'garbage', '!!!']) {
      expect(decodeOauthState(raw).mode).toBe('login');
    }
  });
});
