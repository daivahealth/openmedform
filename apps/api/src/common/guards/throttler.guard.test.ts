import { describe, expect, it } from 'vitest';

import { UserAwareThrottlerGuard } from './throttler.guard';
import { AI_THROTTLE, AUTH_THROTTLE, DEFAULT_THROTTLE } from '../throttle.config';

/** getTracker is protected; the keying rule is the whole point of the guard. */
const track = (req: unknown) =>
  (
    new UserAwareThrottlerGuard(
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as { getTracker(r: unknown): Promise<string> }
  ).getTracker(req);

describe('UserAwareThrottlerGuard', () => {
  it('keys authenticated traffic by user, not by IP', async () => {
    // A hospital behind one NAT must not share a bucket: the expensive routes
    // all require a token, so the user id is both fairer and harder to rotate.
    await expect(track({ user: { userId: 'u1' }, ip: '10.0.0.1' })).resolves.toBe('user:u1');
    await expect(track({ user: { userId: 'u2' }, ip: '10.0.0.1' })).resolves.toBe('user:u2');
  });

  it('keys unauthenticated traffic by IP', async () => {
    // Login has no user, and the attacker picks the email, not the address.
    await expect(track({ ip: '203.0.113.9' })).resolves.toBe('ip:203.0.113.9');
  });

  it('prefers the client address from the proxy chain', async () => {
    // Behind Cloud Run, req.ip is the proxy; req.ips[0] is the real client.
    await expect(track({ ips: ['203.0.113.9', '10.1.1.1'], ip: '10.1.1.1' })).resolves.toBe(
      'ip:203.0.113.9',
    );
  });

  it('falls back to req.ip when the proxy chain is empty', async () => {
    // Local dev has no proxy, so `ips` is [] and `ip` is the client.
    await expect(track({ ips: [], ip: '127.0.0.1' })).resolves.toBe('ip:127.0.0.1');
  });

  it('never returns an empty key', async () => {
    // An empty tracker would silently merge every anonymous caller into one
    // bucket — or, depending on the store, into none.
    await expect(track({})).resolves.toBe('ip:unknown');
  });
});

describe('throttle tiers', () => {
  it('keeps credential and AI limits well below the default backstop', async () => {
    expect(AUTH_THROTTLE.default.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
    expect(AI_THROTTLE.default.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });

  it('uses a one-minute window everywhere, so the numbers compare directly', () => {
    for (const tier of [DEFAULT_THROTTLE, AUTH_THROTTLE.default, AI_THROTTLE.default]) {
      expect(tier.ttl).toBe(60_000);
    }
  });
});
