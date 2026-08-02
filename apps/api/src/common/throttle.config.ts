/**
 * Rate-limit tiers.
 *
 * Kept in one place so the numbers can be read against each other, and so the
 * routes only name a tier rather than restating a window.
 *
 * A HARD CAVEAT ON CLOUD RUN: the throttler's default storage is in-memory and
 * therefore per-instance. With N instances serving, the effective limit is
 * N times the number below. Deployment pins `--max-instances` so that multiple
 * is bounded and known rather than unbounded, but a strict global limit needs
 * shared storage (Redis) or an edge control (Cloud Armor). These numbers are a
 * floor on abuse cost, not a guarantee.
 */

const MINUTE = 60_000;

/** Everything not otherwise annotated. Generous: this is a backstop. */
export const DEFAULT_THROTTLE = { ttl: MINUTE, limit: 300 };

/**
 * Credential endpoints. Keyed by IP, because the attacker picks the email.
 * Ten a minute is far above what a human typing a password needs and far
 * below what makes online guessing worthwhile.
 */
export const AUTH_THROTTLE = { default: { ttl: MINUTE, limit: 10 } };

/**
 * Anything that calls an LLM provider. Keyed by user (see
 * UserAwareThrottlerGuard). These are slow and cost real money per call — one
 * conversion can be two provider calls plus a headless browser — so single
 * digits per minute is already generous for interactive use.
 */
export const AI_THROTTLE = { default: { ttl: MINUTE, limit: 10 } };

/**
 * File uploads that do not themselves call a provider but do allocate and
 * parse attacker-supplied bytes.
 */
export const UPLOAD_THROTTLE = { default: { ttl: MINUTE, limit: 30 } };
