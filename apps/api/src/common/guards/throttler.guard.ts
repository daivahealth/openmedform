/**
 * Rate limiting, keyed by the caller rather than only by IP.
 *
 * WHY NOT PLAIN IP — a hospital sits behind one NAT, so IP-keyed limits on
 * authenticated routes punish an entire site for one heavy user. The expensive
 * routes (AI conversion, refine) all require a valid token, so for those the
 * user id is both fairer and harder to rotate than an IP.
 *
 * Unauthenticated traffic — login above all — has no user, so it falls back to
 * IP. That is the right key there: the attacker chooses the email, not the
 * source address.
 *
 * ORDERING MATTERS. This guard reads `req.user`, which only exists after the
 * JWT guard has run, so it is registered AFTER JwtAuthGuard in AuthModule. If
 * it is ever moved ahead of that, every request silently reverts to IP keying
 * and the per-user limits stop working — with no error to notice.
 */

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackedRequest {
  user?: { userId?: string };
  ip?: string;
  ips?: string[];
}

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: TrackedRequest): Promise<string> {
    const userId = req.user?.userId;
    if (userId) return `user:${userId}`;

    // `req.ips` is populated (left-to-right, client first) only when Express
    // trusts the proxy; see TRUST_PROXY_HOPS in main.ts. Falling back to
    // `req.ip` keeps this working locally where there is no proxy at all.
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    return `ip:${ip ?? 'unknown'}`;
  }
}
