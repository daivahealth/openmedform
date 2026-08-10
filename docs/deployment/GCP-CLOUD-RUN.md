# GCP Cloud Run Deployment

Production deployment: **API + Web on Cloud Run**, **Supabase Postgres**,
**Google + Microsoft SSO**, CI/CD from GitHub Actions (issue #26).

## Architecture

| Component | Platform | Notes |
|-----------|----------|-------|
| Database | Supabase Postgres | Prisma via direct connection `:5432` (API is a persistent server, not serverless) |
| API | Cloud Run (`openmedform-api`) | Docker — `apps/api/Dockerfile` (includes poppler-utils + chromium); handles SSE + long LLM calls |
| Web | Cloud Run (`openmedform-web`) | Docker — Next.js `output: 'standalone'`, `apps/web/Dockerfile` |
| Storage | none | Conversion uploads are ephemeral (memory → temp → discarded); form assets live in Postgres (`form_asset.data`) |
| CI/CD | GitHub Actions | `.github/workflows/deploy.yml`, keyless auth via Workload Identity Federation |

## 1. Supabase (manual)

1. Create a Supabase project.
2. Copy the connection string. **Note:** Supabase now serves direct
   connections (`db.<ref>.supabase.co:5432`) over **IPv6 only** — this works
   from Cloud Run but NOT from IPv4-only networks (e.g. the dev Mac). For
   local CLI access (migrate/seed), use the **Session pooler** string from
   Dashboard → Connect (port 6543, IPv4-reachable). `DATABASE_URL` in Secret
   Manager keeps the direct string.
3. Store it as the `DATABASE_URL` secret (step below). Migrations run
   automatically on deploy: `deploy.yml` runs `prisma migrate deploy` as a
   Cloud Run Job (`openmedform-migrate`) built from the image being shipped,
   before the new API revision rolls out. Nothing to run by hand, and a failed
   migration stops the deploy rather than shipping a revision that crash-loops.

## 2. GCP one-time setup (scripted)

```bash
export GCP_PROJECT_ID=my-project
export GCP_REGION=us-central1
export GITHUB_REPO=daivahealth/openmedform
./scripts/gcp-setup.sh
```

The script enables the required APIs (Cloud Run, Cloud Build, Artifact
Registry, Secret Manager, IAM Credentials) and creates:

- Artifact Registry repo `openmedform`
- Deploy service account `github-deploy` (roles: `run.admin`,
  `artifactregistry.writer`, `iam.serviceAccountUser` on the runtime SA)
- Runtime service account `openmedform-runtime` (runs both Cloud Run services,
  has `secretmanager.secretAccessor` on the app secrets)
- Workload Identity Federation pool + OIDC provider restricted to the GitHub
  repo (keyless — no JSON service-account keys anywhere)
- Secret Manager entries (placeholder values): `DATABASE_URL`, `JWT_SECRET`,
  `AI_ENCRYPTION_KEY`, `FRONTEND_ORIGIN`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `MICROSOFT_CLIENT_ID`,
  `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`

  All of them are created even if you only intend to use one SSO provider:
  `deploy.yml` mounts the full list, and Cloud Run fails a deploy that
  references a secret which does not exist. A provider left at `CHANGE_ME` is
  simply switched off (see §3).

After the script, fill the real secret values and set the printed GitHub
Actions variables (`GCP_PROJECT_ID`, `GCP_REGION`,
`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `API_URL`, `WEB_URL`).

Generate strong secrets with `openssl rand -hex 32` for `JWT_SECRET` and
`AI_ENCRYPTION_KEY`.

## 3. SSO (Google and Microsoft)

Backend routes (NestJS, `passport-google-oauth20` / `passport-microsoft`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/google` | Redirects to Google consent |
| GET | `/api/auth/google/callback` | Redirects to `<FRONTEND_ORIGIN>/auth/callback?code=<one-time code>` |
| GET | `/api/auth/microsoft` | Redirects to Microsoft consent |
| GET | `/api/auth/microsoft/callback` | Same one-time-code redirect as Google |
| POST | `/api/auth/exchange` | Trades the one-time code for the session JWT |

The redirect carries a single-use code, never the JWT — a token in the URL
lands in browser history, `Referer` headers and every access log in between.
Both providers share one callback handler so this cannot drift between them.

Tenant mapping is **invite-only match-by-email**: the SSO email must match
exactly one existing active user (created beforehand by a tenant admin via the
user module), unless the handshake was started in signup mode. If the email
matches no account or accounts in multiple tenants, the user is redirected back
to the login page with an explanatory error.

Each provider is independent: its strategy is only registered when its client
id is set to a real value, so local dev and password-only deployments boot
without any SSO config, and enabling Google does not require Microsoft. A
provider whose client id is missing, still `CHANGE_ME`, or otherwise not a
real credential answers its routes with 503 and leaves the others untouched.

"Not a real credential" means the value contains whitespace or angle brackets —
an unsubstituted `<Application (client) ID>` from these instructions, or a
command pasted into a prompt that was waiting for input. Both have happened.
The reason to reject them here rather than pass them on is the error the user
would otherwise see: the identity provider answers a malformed client id with
something like `AADSTS90013: Invalid input received from the user`, which
blames the person signing in and says nothing about the deployment. A 503
naming the provider is both true and actionable.

Google Cloud Console setup (manual):

1. Create an OAuth 2.0 client (Web application).
2. Authorized redirect URI: `https://api.<domain>/api/auth/google/callback`.
3. Store client ID/secret as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and
   set `GOOGLE_CALLBACK_URL` to the same redirect URI.

Azure Portal setup (manual):

1. Entra ID > App registrations > New registration. Supported account types:
   **Accounts in any organizational directory** (work/school accounts) —
   matches the `organizations` default of `MICROSOFT_TENANT`.
2. Redirect URI (Web): `https://api.<domain>/api/auth/microsoft/callback`.
3. Certificates & secrets > New client secret. Copy the **Value**, not the
   Secret ID — the value is shown once. Note its expiry: Azure caps client
   secrets at 24 months, and sign-in breaks the day it lapses.
4. API permissions: Microsoft Graph delegated `User.Read` (present by default).
5. Store the values as `MICROSOFT_CLIENT_ID` (Application/client ID),
   `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_CALLBACK_URL` (the same redirect
   URI). Optionally set `MICROSOFT_TENANT` to a directory GUID to restrict
   sign-in to one organisation, or to `common` to also admit personal Microsoft
   accounts — a weaker identity signal, since anyone can create one.

Microsoft sign-in requires the account to have an organisational mailbox: the
strategy reads Graph `mail` only and refuses a profile without one, rather than
falling back to `userPrincipalName`. See docs/security/AUTH-AND-RBAC.md for why
that fallback would be an account-takeover path.

Frontend: the login page has "Sign in with Google" and "Sign in with Microsoft"
buttons linking to `<NEXT_PUBLIC_API_URL>/api/auth/google` and
`/api/auth/microsoft`; both return to `/auth/callback`, which trades the
one-time code for a session and hydrates the profile from `/api/auth/me`.

## 4. CI/CD (`.github/workflows/deploy.yml`)

On push to `main` (app/package changes) or manual dispatch:

1. Authenticates via `google-github-actions/auth` (WIF).
2. Builds both images from the **repo-root context** with per-app Dockerfiles
   (`docker build -f apps/api/Dockerfile .`), tags `:<sha>` and `:latest`,
   pushes to Artifact Registry.
3. Web image is built with `--build-arg NEXT_PUBLIC_API_URL=<API_URL>`
   (baked at build time — `NEXT_PUBLIC_*` is compile-time in Next.js).
4. Deploys both services with `google-github-actions/deploy-cloudrun`; API
   env comes from Secret Manager via the `secrets:` mapping.

This workflow is independent of `release.yml` (npm package publishing).

## 5. Custom domain — Load Balancer (implemented)

Production runs **same-origin** behind a global external Application Load
Balancer (`scripts/gcp-lb-setup.sh`, idempotent):

| Path | Backend |
|------|---------|
| `https://openmedform.daiva.health` | `openmedform-web` (default) |
| `https://openmedform.daiva.health/api/*` | `openmedform-api` (path rule) |

Components: static global IP, two serverless NEGs (asia-south1), two backend
services (default timeout — a custom `timeoutSec` is rejected for serverless
NEG backends; request length is governed by Cloud Run's own timeout), URL map,
Google-managed cert, HTTPS proxy + 443 forwarding rule, and an HTTP→HTTPS
redirect on port 80.

Why a load balancer: **Cloud Run domain mappings are not available in
asia-south1** (and the LB gives same-origin, which eliminates CORS and keeps
the OAuth flow on one domain). Cost ~$18–25/mo.

Setup notes:
- DNS (Netlify): one `A` record `openmedform` → LB static IP. The managed
  cert provisions only after DNS resolves (`managed.status` → ACTIVE).
- Same-origin works with zero code changes: the web app calls paths under
  `/api`, so `NEXT_PUBLIC_API_URL` is simply `https://openmedform.daiva.health`.
- After mapping: `FRONTEND_ORIGIN` = `https://openmedform.daiva.health`,
  callback URL = `https://openmedform.daiva.health/api/auth/google/callback`
  (must also be added to the OAuth client's authorized redirect URIs),
  GitHub vars `API_URL` = `WEB_URL` = `https://openmedform.daiva.health`.
  Roll a new API revision and rebuild/redeploy web to pick these up.

## Caveats

- **Cold starts**: the API runs with `--min-instances=1` so it never scales to
  zero. This was measured, not guessed: warm, the whole sign-in path is
  100–200 ms (a Supabase round trip is ~85 ms of that), but a cold start put
  seconds of image pull and Nest boot in front of a user who had just clicked
  "Sign in with Google" and had nothing to look at meanwhile. One always-on
  instance is billed continuously — that is the trade being made. **Web still
  scales to zero**; it is a lighter image and is already warm by the time the
  callback lands, but give it the same flag if a first page load feels slow.
- **Migration race**: fixed. Migrations no longer run in the container CMD;
  `deploy.yml` runs them once per deploy as the `openmedform-migrate` Cloud Run
  Job, so `--max-instances=4` cannot make instances queue behind each other's
  advisory lock. Self-hosted `docker-compose` keeps migrate-on-boot via an
  explicit `command:` override, since it has no deploy step to hang this on.
- **AI provider costs**: Claude/OpenAI tokens are pay-per-use (keys stored
  per-tenant, encrypted in Postgres via `AI_ENCRYPTION_KEY`).
- **`--no-cpu-throttling` is required, not optional.** Conversion runs
  fire-and-forget *after* the HTTP response is sent. Cloud Run's default
  throttles an instance's CPU to near zero once a request completes, so
  background work only progresses if it is network-bound. LLM calls survive
  that; **CPU-bound work does not**. Launching Chromium to render a script-built
  HTML mock-up is CPU-bound, so under the default it cannot finish and the
  upload is rejected as if the file were at fault. `deploy.yml` sets
  `--memory=1Gi --no-cpu-throttling` on the API for this reason.

  Note this bills the instance for its whole lifetime, not just request time.
  Keeping `maxScale` modest and letting it scale to zero bounds the cost.
- **Memory**: 1 GiB. 512Mi is enough to render (verified against the production
  image at that limit), but leaves nothing spare next to Node and a large LLM
  payload.
- **Chromium's own sandbox** stays enabled — the renderer never passes
  `--no-sandbox`, since that sandbox is the isolation boundary for untrusted
  uploaded code. Verified working in the deployed Alpine image. If a future
  runtime cannot support it, disable rendering with `HTML_RENDER_DISABLED=1`
  rather than weakening the sandbox.
- The image sets `CHROMIUM_PATH=/usr/bin/chromium-browser`. See
  [PDF-TO-FORM](../features/PDF-TO-FORM.md#mock-ups-that-build-their-form-with-javascript).
