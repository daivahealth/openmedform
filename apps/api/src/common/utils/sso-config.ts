/**
 * Is an SSO credential actually set, or is it still a stand-in?
 *
 * Deployments reach this file's callers with three kinds of value: a real
 * credential, nothing at all, and — the case worth naming — something that was
 * meant to be replaced and wasn't. `scripts/gcp-setup.sh` seeds every secret
 * with `CHANGE_ME`, and setup instructions carry `<Application (client) ID>`
 * style angle-bracket markers that get stored verbatim when a copy-paste
 * misses a step. A whole shell command has landed in a secret this way, pasted
 * into a prompt that was still waiting on input.
 *
 * The cost of not noticing is a bad error. A missing credential gives an
 * honest "not configured" 503; an unsubstituted one looks configured, so the
 * user is handed off to the identity provider and meets something like
 * `AADSTS90013: Invalid input received from the user` — which says nothing
 * about the real problem and points at the person signing in rather than at
 * the deployment.
 *
 * So placeholders are treated as absent. The provider stays switched off and
 * says so, which is both true and actionable.
 */

/** A real OAuth client id or secret is one opaque token — no spaces, no markup. */
const PLACEHOLDER_MARKERS = /[<>\s]/;

export function isSsoCredentialConfigured(value: string | undefined): boolean {
  if (!value) return false;

  const trimmed = value.trim();
  if (!trimmed) return false;
  // The literal seeded by scripts/gcp-setup.sh.
  if (trimmed === 'CHANGE_ME') return false;

  return !PLACEHOLDER_MARKERS.test(trimmed);
}
