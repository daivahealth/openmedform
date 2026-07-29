# Authentication and RBAC

## Authentication
- Stateless JWT auth. Token issued on login, carried in `Authorization: Bearer <token>` header.
- JWT payload: `{ sub: userId, tenantId, email, role, iat, exp }`
- Token expiry: 24 hours (configurable via `JWT_EXPIRY` env var)
- Password hashing: bcrypt (cost factor 10)

## Self-Service Signup
- **Signup is Google-only** — there is no email/password registration (`POST /api/auth/register` was removed).
- The signup page collects **organization name and country (both mandatory)**, then starts the Google handshake: `GET /api/auth/google?mode=signup&org=...&country=...`.
- On first Google sign-in, a **new tenant** (with the requested name + country) and its first `TENANT_ADMIN` are provisioned in one transaction, then a session is issued — the true SaaS "new organization per signup" model.
- Email must be **globally unique**: signup is rejected if the email already exists in any tenant (even inactive). This keeps Google SSO's match-by-email unambiguous.
- The org name is slugified into a unique tenant slug (a short random suffix is appended on collision).
- Audit-logged as `auth.register` (`method: google`, includes organizationName + country).

## Google SSO
- OAuth2 via `passport-google-oauth20`: `GET /api/auth/google` → Google consent → `GET /api/auth/google/callback` → app JWT → redirect to `<FRONTEND_ORIGIN>/auth/callback?token=<jwt>`.
- **Login vs signup intent** (and, for signup, the organization name + country) is carried through the OAuth `state` param — a base64url JSON payload set by `GoogleAuthGuard` and read back in `GoogleStrategy.validate` (legacy plain `login`/`signup` strings still accepted):
  - **login** (default): invite-only match-by-email — the Google email must match exactly one existing active user; unknown emails are rejected.
  - **signup**: if no account exists, a **new tenant + first `TENANT_ADMIN`** is provisioned (Google display name → `fullName`; organization + country from the state payload — the guard rejects the handshake without them). Password login is disabled for these accounts (random hash).
- Either intent rejects an ambiguous multi-tenant email; a signup whose email already exists (even inactive) is rejected with "please sign in instead". Email stays globally unique.
- The strategy registers only when `GOOGLE_CLIENT_ID` is configured; without it the SSO routes return 503 and password login is unaffected.
- SSO failures redirect to `<FRONTEND_ORIGIN>/login?error=google_sso&message=...` — never raw JSON, since the browser is mid-redirect.

## Roles
| Role | Permissions |
|------|------------|
| SUPER_ADMIN | All operations across all tenants |
| TENANT_ADMIN | Manage users, forms, submissions within tenant |
| FORM_DESIGNER | Create/edit/publish forms, view submissions |
| CLINICIAN | Fill forms, view own submissions |
| VIEWER | Read-only access to forms and submissions |

## Audit Logging
A central `AuditService` writes to the `audit_log` table (this closed issue #1 —
previously the table existed but nothing wrote to it). Auditing is best-effort:
a logging failure is logged and swallowed so it can never roll back the audited
clinical operation, and is recorded after the primary write commits.

**Currently wired:**
- Auth: `auth.register`, `auth.login`, `auth.login.failed` (email + IP)
- Forms: `form.create`, `form.publish`, `form.delete`
- Submissions: `submission.complete`, `submission.sign`
- Designer: `form.designer.refine`

Each entry captures tenant, user, action, resource type/id, IP address, and a
JSON `details` payload (e.g. version, engine, content hash, risk level, login
method). A failed login with no matching user is recorded against the nil UUID
tenant (no tenant to scope to).

**Planned (not yet wired):** logout, form schema edit/archive/clone, AI Builder
generate/refine/PDF upload actions (token usage for these IS metered — see below).

## AI Token Metering
- Every LLM call is metered by `AiUsageService`, which wraps each provider so the
  token usage reported by the SDK is persisted to the `ai_usage` table (one row
  per call: tenant, user, provider, model, operation, input/output/total tokens).
- Metering is best-effort — a persistence failure is logged and swallowed so it
  can never break the AI generation it measures.

## Platform Analytics (SUPER_ADMIN)
- `GET /api/admin/stats` exposes a cross-tenant operator view: platform totals,
  per-tenant and per-user breakdowns (forms, submissions, last login, token
  usage), usage by provider, and recent logins.
- Gated to `SUPER_ADMIN` via `@Roles('SUPER_ADMIN')` + the global `RolesGuard`;
  every other role receives 403. This is the one deliberately cross-tenant read
  in the system — all domain queries remain tenant-scoped.
- Promote an existing account to operator with:
  `UPDATE "user" SET role='SUPER_ADMIN' WHERE email='<you>';`

## Published-Version Immutability
Published `form_version` rows are immutable. On publish, a SHA-256 `content_hash`
of the canonical payload (formio `schema`, or jsonforms data/ui/print schemas +
translations) is stored. Edits after publish fork a new draft version rather than
mutating the published one, and `GET /forms/:id/versions/:versionId/integrity`
recomputes the hash to detect out-of-band tampering. Every submission stays
pinned to the exact `form_version_id` (and engine) it was captured against.

## Server-Side Validation
jsonforms submissions are re-validated server-side with Ajv (Draft 2020-12)
against the published data schema on `complete` — client validity is advisory and
never trusted (Form Engine Rules). Scores are likewise recalculated server-side.

## LLM API Key Security
- Keys stored in environment variables only
- Never logged, never returned in API responses
- Provider name and model logged in audit, never the key
