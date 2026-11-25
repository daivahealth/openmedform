import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger, UnauthorizedException } from '@nestjs/common';

import { SsoAuthExceptionFilter } from './sso-auth.filter';

const CONFIG = {
  get: (_k: string, d?: string) => d ?? 'https://app.example.test',
} as never;

/**
 * The callback URL carries the provider's authorization `code`. A filter that
 * logged `req.url` would write a live credential into every log sink on the
 * way, so the host is given one and the assertions check it never escapes.
 */
const CODE = '4/0AUn6Hd8t_lWW16pUEZHvzMtTg4pC4k';

function host(path = '/api/auth/google/callback') {
  const res = { redirect: vi.fn() };
  const req = { path, url: `${path}?code=${CODE}&state=eyJtIjoibCJ9` };
  return {
    res,
    host: { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as never,
  };
}

function captureLogs() {
  return {
    warn: vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('SsoAuthExceptionFilter', () => {
  it('passes a deliberate rejection through to the user and logs it as a warning', () => {
    const logs = captureLogs();
    const { res, host: h } = host();

    new SsoAuthExceptionFilter(CONFIG).catch(
      new UnauthorizedException('No account exists for this email.'),
      h,
    );

    const target = new URL(res.redirect.mock.calls[0][0] as string);
    expect(target.searchParams.get('message')).toBe(
      'No account exists for this email.',
    );
    expect(logs.warn).toHaveBeenCalledOnce();
    expect(logs.error).not.toHaveBeenCalled();
  });

  /**
   * The regression. A database outage threw a plain Error, the user got the
   * generic string, and the filter wrote nothing — so the only evidence the
   * API was broken was a query param on the login page.
   */
  it('logs an unexpected fault at error level, with the stack', () => {
    const logs = captureLogs();
    const { res, host: h } = host();
    const fault = new Error("Can't reach database server at db.example:5432");

    new SsoAuthExceptionFilter(CONFIG).catch(fault, h);

    const target = new URL(res.redirect.mock.calls[0][0] as string);
    expect(target.searchParams.get('message')).toBe('Sign-in failed');
    expect(logs.warn).not.toHaveBeenCalled();
    expect(logs.error).toHaveBeenCalledOnce();
    expect(logs.error.mock.calls[0][1]).toBe(fault.stack);
  });

  it('survives a thrown non-Error', () => {
    const logs = captureLogs();
    const { res, host: h } = host();

    expect(() =>
      new SsoAuthExceptionFilter(CONFIG).catch('boom', h),
    ).not.toThrow();
    expect(res.redirect).toHaveBeenCalledOnce();
    expect(logs.error.mock.calls[0][1]).toBe('boom');
  });

  it('never writes the authorization code to the log', () => {
    const logs = captureLogs();
    const { host: h } = host();

    new SsoAuthExceptionFilter(CONFIG).catch(new Error('nope'), h);

    const written = JSON.stringify([
      ...logs.error.mock.calls,
      ...logs.warn.mock.calls,
    ]);
    expect(written).not.toContain(CODE);
    expect(written).toContain('/api/auth/google/callback');
  });
});
