/**
 * The OAuth `state` payload, shared by every SSO provider.
 *
 * The handshake has to carry the user's intent across the redirect to the
 * identity provider and back: login, or signup with the organisation name and
 * country that become the new tenant. Neither can be derived from an SSO
 * profile, and the callback is the same endpoint for both.
 *
 * Provider-neutral on purpose — Google and Microsoft encode and decode the
 * identical payload, so the two can never drift apart in how intent travels.
 */

export interface SsoSignupDetails {
  organizationName: string;
  country: string;
}

/**
 * Decode the OAuth `state` payload produced by the OAuth guard (base64url
 * JSON). Tolerates the legacy plain 'signup'/'login' strings from older
 * links; anything unparseable degrades safely to login intent.
 */
export function decodeOauthState(raw: unknown): {
  mode: 'login' | 'signup';
  signup?: SsoSignupDetails;
} {
  if (raw === 'signup' || raw === 'login') {
    return { mode: raw };
  }
  if (typeof raw === 'string' && raw) {
    try {
      const payload = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      );
      if (payload?.m === 'l') {
        return { mode: 'login' };
      }
      const organizationName = String(payload?.o ?? '').trim();
      const country = String(payload?.c ?? '').trim();
      if (payload?.m === 's' && organizationName && country) {
        return {
          mode: 'signup',
          signup: {
            organizationName: organizationName.slice(0, 255),
            country: country.slice(0, 100),
          },
        };
      }
    } catch {
      // fall through to safe default
    }
  }
  return { mode: 'login' };
}
