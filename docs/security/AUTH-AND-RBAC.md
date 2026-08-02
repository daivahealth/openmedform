# Authentication and RBAC

## Authentication
- Stateless JWT auth. Token issued on login, carried in `Authorization: Bearer <token>` header.
- **The web UI signs in with Google only** (no email/password form); `POST /api/auth/login` remains available for API clients and the seeded admin.
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
| SUPER_ADMIN | All operations across all tenants; platform analytics (`/api/admin/*`); global AI provider configuration |
| TENANT_ADMIN | Manage users, forms, submissions, and tenant AI providers |
| FORM_DESIGNER | Create/edit/publish forms, view submissions, and manage tenant AI providers |
| CLINICIAN | Fill forms, view own submissions, and manage tenant AI providers |
| VIEWER | Read-only access to forms and submissions; manage tenant AI providers |

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
- Conversion: `ai.convert`, `ai.convert.failed`, `ai.convert.accept`

Each entry captures tenant, user, action, resource type/id, IP address, and a
JSON `details` payload (e.g. version, engine, content hash, risk level, login
method). A failed login with no matching user is recorded against the nil UUID
tenant (no tenant to scope to).

**Planned (not yet wired):** logout, form schema edit/archive/clone, AI Builder
generate/refine/PDF upload actions (token usage for these IS metered — see below).

## Rate Limiting

`@nestjs/throttler` is registered globally (`AuthModule`), with tiers in
`apps/api/src/common/throttle.config.ts`:

| Tier | Limit | Keyed by | Applied to |
|---|---|---|---|
| default | 300/min | user, else IP | everything else |
| auth | 10/min | IP | `POST /api/auth/login`, `GET /api/auth/google` |
| ai | 10/min | **user** | `POST /api/conversions`, `/api/forms/from-prompt`, `/api/forms/:id/jsonforms/refine` |
| upload | 30/min | user | `POST /api/forms/:id/assets`, `/api/forms/import` |

`GET /api/health` is exempt — the platform's own liveness probes hit it on a
timer, and a throttled health check reads as an outage.

**Keying.** `UserAwareThrottlerGuard` keys authenticated traffic by user id, not
by IP: a hospital sits behind one NAT, and the expensive routes all require a
token anyway. Unauthenticated traffic falls back to IP, which is the right key
for login — the attacker chooses the email, not the source address. The guard is
registered **after** `JwtAuthGuard` so `req.user` exists; moving it earlier
silently downgrades every per-user limit to per-IP.

Behind Cloud Run, `TRUST_PROXY_HOPS=1` makes Express resolve the real client
address instead of the load balancer's.

### What this does and does not guarantee

The throttler's storage is **in-memory, and therefore per-instance**. With N
instances serving, the effective limit is N × the number above. Deployment pins
`--max-instances=4`, so the multiple is bounded and known rather than
unbounded — but these numbers are a floor on abuse cost, not a hard global
limit. A strict guarantee needs shared storage (Redis) or an edge control
(Cloud Armor). Sizing the limits well below what a user could plausibly need
is what makes the 4× slack acceptable in the meantime.

There is also **no per-email lockout**: ten login attempts a minute per IP
bounds online guessing from one source, but not a distributed attempt against
one account. That needs persistent state rather than an in-process counter.

## Uploaded Mock-ups Are Untrusted Input

An uploaded HTML mock-up is attacker-controlled. Three deliberate rules bound
what it can do, and each has one narrow, documented exception:

| Rule | Exception |
|---|---|
| **Scripts are stripped** and never shown to the model. | With a per-upload opt-in, they are **parsed** (acorn, AST only — no `eval`, no `Function`, no VM) for named *literal* config: option lists, thresholds, reference tables. Any value containing an identifier, call, template hole, spread or function is discarded whole. Hard caps on bytes parsed, entries, depth, string length and total size. The `<script>` element is still removed from the cleaned HTML either way. |
| **Hidden content is stripped** — it is the natural place to smuggle instructions past the person uploading the file. | A conditional "Please specify…" `<input>` (or empty `<textarea>`) beside a select's "Other" option is kept and given a SHOW rule. Never a container; label capped at 60 characters. |
| **The page is never executed in our process.** | A sandboxed headless browser may run it — Chromium's own OS-level sandbox is the isolation boundary, with no network and a hard timeout. Uploaded script is never evaluated in the API process. |
| **The page is not driven around.** | A bounded probe presses controls whose text matches the "Add …" patterns — never submit/save/delete/print — once each, at most three, within its own budget raced inside the render timeout, with dialogs auto-dismissed. It only adds precision: a probe that stalls or crashes yields the un-probed result. `HTML_PROBE_DISABLED=1` switches it off. |

Everything recovered is DATA. It is framed to the model as UNTRUSTED SOURCE
MATERIAL, it only ever becomes JSON schema values, and both renderers plus the
print engine escape by default — so it never re-enters an HTML context.

The script opt-in is the only one of the three that a user can widen, so it is
off by default, is per-upload rather than a saved setting, and is recorded in
the `ai.convert` audit entry (`details.extractScriptConfig`) whether or not it
was used. Everything it read is listed in the conversion warnings for the
reviewer.

Full detail: [PDF-TO-FORM — security model](../features/PDF-TO-FORM.md#security-model).

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
of the canonical payload (data/ui/print schemas +
translations) is stored. Edits after publish fork a new draft version rather than
mutating the published one, and `GET /forms/:id/versions/:versionId/integrity`
recomputes the hash to detect out-of-band tampering. Every submission stays
pinned to the exact `form_version_id` (and engine) it was captured against.

## Server-Side Validation
jsonforms submissions are re-validated server-side with Ajv (Draft 2020-12)
against the published data schema on `complete` — client validity is advisory and
never trusted (Form Engine Rules). Scores are likewise recalculated server-side.

## Encryption of Stored Provider Keys

Tenant LLM API keys are encrypted at rest with AES-256-GCM (a fresh IV per
record, auth tag verified on decrypt) in `apps/api/src/common/utils/crypto.ts`.

**The key is derived, not sliced.** It used to be
`Buffer.from(AI_ENCRYPTION_KEY.slice(0, 32), 'utf8')` — the first 32
*characters* of the env var, which for a printable passphrase is well under 256
bits. Now:

- a 64-char **hex** or 32-byte **base64** secret is used directly, as real key
  material, with no derivation loss;
- anything else is treated as a passphrase and stretched with `scrypt` against a
  fixed application salt (fixed so the cost is paid once and cached — the salt
  separates deployments, it is not standing in for many low-entropy passwords);
- known placeholders, including the one this repository used to default to, are
  **rejected at startup**. A deployment running on a published key has no
  encryption at all, and failing to start is the only honest response.

`AI_ENCRYPTION_KEY` is now required by `docker-compose.yml` (`:?`), matching
`JWT_SECRET`. It previously fell back to a default committed here.

### Upgrading without losing credentials

Ciphertext is versioned. New records carry a `v2.` prefix; unprefixed records
are read with the legacy key, so an upgrade does not wipe every tenant's stored
provider credentials. Nothing has to be migrated for the system to work.

To retire the legacy key deliberately rather than by attrition:

```bash
AI_ENCRYPTION_KEY=<same secret> DATABASE_URL=... \
  npx tsx scripts/reencrypt-provider-keys.ts --dry-run   # report only
```

Run with the **same** secret the legacy records were written under — this
migrates the derivation, not the secret. It is idempotent, verifies each
re-encrypted record reads back before writing it, and reports rather than
overwrites anything it cannot decrypt.

**Rotating the secret itself is a different operation** and the script cannot do
it: old ciphertext becomes unreadable and the affected tenants must re-enter
their keys in Settings → AI Providers.

## LLM API Key Security
- Keys are configured in **AI Settings** by authenticated tenant users for their own tenant, or globally by `SUPER_ADMIN`. They are stored in Postgres encrypted at rest (AES-256-GCM via `AI_ENCRYPTION_KEY`) and can fall back to environment variables (see `docs/features/AI-BUILDER.md` §Security for the resolution order). Provider mutations are audit-logged without keys.
- Never logged, never returned in API responses (masked form only)
- Provider name and model logged in audit, never the key
