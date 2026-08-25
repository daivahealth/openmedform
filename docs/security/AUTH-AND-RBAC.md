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

## SSO (Google and Microsoft)

Both providers are **optional and independent** — a deployment can enable
either, both or neither, and boots the same way. A strategy is constructed only
when its client id is present, and pressing an unconfigured provider's button
returns a clear 503 rather than sending the user off with bad credentials.

Everything after the provider vouches for the user is shared: the same OAuth
`state` payload carries login-vs-signup intent, the same `resolveSsoUser`
resolves or provisions, the same filter turns a failure into a redirect, and one
`completeSsoLogin` issues the session. What lands in that redirect is a security
decision, so it is made once rather than per provider. `auth.login` and
`auth.register` record which provider was used in `details.method`.

### Microsoft requires an organisational email

Google returns a verified address. Azure has two email-shaped values and they
are **not** equivalent:

- `mail` — the mailbox the tenant assigned. Trustworthy.
- `userPrincipalName` — a sign-in name that looks like an email and often is
  not one. In a tenant you control, you can set it to anything.

Login matches an existing user **by email** and signup provisions a tenant keyed
on it, so accepting a UPN would let someone with their own Azure tenant set a
UPN matching one of your users and sign in as them. `passport-microsoft`'s
`addUPNAsEmail` therefore stays at its default of **false** — `profile.emails`
carries `mail` alone — and a profile without one is **refused**, with a message
telling the user to ask IT for a mailbox. A test asserts `addUPNAsEmail: true`
never appears in the strategy, because a "missing email" report is exactly the
kind of thing someone would try to fix by turning it on.

`MICROSOFT_TENANT` controls which directories may sign in: `organizations`
(default, work/school accounts from any Azure tenant), a specific tenant GUID to
restrict to one organisation, or `common` to also admit personal Microsoft
accounts — a weaker identity signal, since anyone can create one.

## How an SSO sign-in resolves

Identical for both providers — only the consent screen differs.

`GET /api/auth/<provider>` → the provider's consent → `GET
/api/auth/<provider>/callback` → `completeSsoLogin` → redirect to
`<FRONTEND_ORIGIN>/auth/callback?code=<one-time code>` (never the token — see
below).

- **Login vs signup intent** (and, for signup, the organization name + country)
  travels through the OAuth `state` param — a base64url JSON payload written by
  the handshake guard and read back by `decodeOauthState` in `oauth-state.ts`
  (legacy plain `login`/`signup` strings still accepted):
  - **login** (default): invite-only match-by-email — the address must match
    exactly one existing active user; unknown emails are rejected.
  - **signup**: if no account exists, a **new tenant + first `TENANT_ADMIN`** is
    provisioned (SSO display name → `fullName`; organization + country from the
    state payload — the guard rejects the handshake without them). Password
    login is disabled for these accounts (random hash).
- Either intent rejects an ambiguous multi-tenant email; a signup whose email
  already exists (even inactive) is rejected with "please sign in instead".
  Email stays globally unique.
- A provider's strategy registers only when its client id is configured;
  without it that provider's routes return 503, and password login and the
  other provider are unaffected.
- Failures redirect to `<FRONTEND_ORIGIN>/login?error=sso&message=...` — never
  raw JSON, since the browser is mid-redirect.

## SSO Redirect Does Not Carry the Token

The SSO callback used to redirect to `/auth/callback?token=<jwt>`. That put a
24-hour credential into browser history, `Referer` headers, and every access log
between the load balancer and the browser — and with no token revocation, a
leaked one stays valid for the full day. Server-side logs are the part that
cannot be cleaned up afterwards.

The redirect now carries a **one-time exchange code** (`?code=…`), which the
callback page immediately POSTs to `POST /api/auth/exchange` for the real
session. The code:

- is 32 random bytes, stored only as a **SHA-256 hash**, so the plaintext exists
  nowhere but the redirect URL;
- is valid for **60 seconds** and **single-use**;
- buys nothing but an exchange — it is useless against every other endpoint;
- is **claimed atomically**: the `usedAt: null` filter lives inside the same
  `updateMany` that marks it used, so two simultaneous requests cannot both win.
  Verified with five parallel exchanges of one code — exactly one succeeded.

Expired, already-spent and unknown codes return the **same** message. Telling
them apart would say which codes are real.

The callback page also strips the code from the address bar with
`history.replaceState` before doing anything else.

It is a database table (`auth_exchange_code`) rather than in-process state
because the redirect and the exchange are two requests that can be served by
different Cloud Run instances. Expired rows are swept opportunistically when new
codes are minted; there is no scheduler.

**This does not fix token storage.** The access token still lands in
`localStorage`, so an XSS on the web origin can still read it — see the
hardening backlog. Moving to an httpOnly cookie would fix both, but the API and
the web app are on different registrable domains, which makes that a
cross-site-cookie problem rather than a one-line change.

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
- Forms: `form.create`, `form.publish`, `form.archive`, `form.unarchive`, `form.delete`
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

## Security Headers

`helmet` is installed in `apps/api/src/main.ts`. The API serves JSON and
uploaded binaries, never HTML pages of its own, so the policy can be strict:
`default-src 'none'`, `frame-ancestors 'none'`, `sandbox`, HSTS, nosniff,
`Referrer-Policy: strict-origin-when-cross-origin`, and
`Cross-Origin-Resource-Policy: same-site`. `X-Powered-By` is removed.

The web app sets its own in `next.config.mjs` — nosniff, `X-Frame-Options`,
HSTS, `Referrer-Policy`, `Permissions-Policy`. **No CSP there yet**: Next's
inline bootstrap and styled-jsx need either nonces or `'unsafe-inline'`, and
shipping the latter would be a CSP in name only. Tracked rather than faked.

### Uploaded assets

`GET /forms/:id/assets/:assetId` returns attacker-supplied bytes, so every
response carries `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'; sandbox`.

**SVG is served as `attachment`, not `inline`.** An SVG is an active document:
navigate straight to one and its `<script>` runs on the API origin. Verified in
a real browser against the pre-fix headers — the script executed and rewrote
`document.title`. With `attachment` the navigation produces no document at all,
and the script never runs.

Embedding still works. An SVG loaded through `<img src>` — which is how the
renderer and the print engine use it — cannot execute script by design, and was
confirmed to render normally with the new headers. So the hole closes without
costing the feature anything, and no SVG sanitiser is needed.

## Uploaded Mock-ups Are Untrusted Input

An uploaded HTML mock-up is attacker-controlled. Four deliberate rules bound
what it can do, and each has a narrow, documented exception:

| Rule | Exception |
|---|---|
| **Scripts are stripped** and never shown to the model. | With a per-upload opt-in, they are **parsed** (acorn, AST only — no `eval`, no `Function`, no VM) for named *literal* config: option lists, thresholds, reference tables. Any value containing an identifier, call, template hole, spread or function is discarded whole. Hard caps on bytes parsed, entries, depth, string length and total size. The `<script>` element is still removed from the cleaned HTML either way. |
| **Hidden content is stripped** — it is the natural place to smuggle instructions past the person uploading the file. | Two carve-outs, both given a SHOW rule instead of being dropped. (1) A conditional "Please specify…" `<input>` (or empty `<textarea>`) beside a select's "Other" option — never a container; label capped at 60 characters. (2) A section the page's **own script** toggles the visibility of (progressive disclosure, e.g. CAM-ICU's Features 2-4) — only if it contains a real field, only on a page that responds to a `change`/`input` event, and capped at 1,500 characters per section, 6,000 per document and 12 sections. Scripts are parsed for the toggle *target* only, never for logic. Both carve-outs are named in a conversion warning, so neither is silent. |
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
