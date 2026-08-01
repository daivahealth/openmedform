# GCP Cloud Run Deployment

Production deployment: **API + Web on Cloud Run**, **Supabase Postgres**,
**Google SSO**, CI/CD from GitHub Actions (issue #26).

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
   automatically on API boot: the Dockerfile CMD is
   `prisma migrate deploy && node dist/main.js`.

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
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`

After the script, fill the real secret values and set the printed GitHub
Actions variables (`GCP_PROJECT_ID`, `GCP_REGION`,
`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `API_URL`, `WEB_URL`).

Generate strong secrets with `openssl rand -hex 32` for `JWT_SECRET` and
`AI_ENCRYPTION_KEY`.

## 3. Google SSO

Backend routes (NestJS, `passport-google-oauth20`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/google` | Redirects to Google consent |
| GET | `/api/auth/google/callback` | Issues app JWT, redirects to `<FRONTEND_ORIGIN>/auth/callback?token=<jwt>` |

Tenant mapping is **invite-only match-by-email**: the Google email must match
exactly one existing active user (created beforehand by a tenant admin via the
user module). No user is auto-provisioned. If the email matches no account or
accounts in multiple tenants, the user is redirected back to the login page
with an explanatory error.

The strategy is only registered when `GOOGLE_CLIENT_ID` is set, so local dev
and password-only deployments boot without Google config (the SSO routes then
return 503).

Google Cloud Console setup (manual):

1. Create an OAuth 2.0 client (Web application).
2. Authorized redirect URI: `https://api.<domain>/api/auth/google/callback`.
3. Store client ID/secret as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and
   set `GOOGLE_CALLBACK_URL` to the same redirect URI.

Frontend: the login page has a "Sign in with Google" button linking to
`<NEXT_PUBLIC_API_URL>/api/auth/google`; `/auth/callback` stores the token and
hydrates the profile from `/api/auth/me`.

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

- **Cold starts**: Cloud Run free tier scales to zero. Set
  `min-instances=1` on the API later if latency matters.
- **Migration race**: boot-time `prisma migrate deploy` can race across
  instances. Fine at min/max 1 instance; if scaling the API beyond one
  instance, move migrations to a Cloud Run Job or a deploy step.
- **AI provider costs**: Claude/OpenAI tokens are pay-per-use (keys stored
  per-tenant, encrypted in Postgres via `AI_ENCRYPTION_KEY`).
- **HTML rendering memory**: converting a mock-up that builds its form in
  JavaScript launches headless Chromium for up to 10s (see
  [PDF-TO-FORM](../features/PDF-TO-FORM.md#mock-ups-that-build-their-form-with-javascript)).
  Give the API instance **at least 1 GiB**; Chromium is short-lived but not
  free. The image sets `CHROMIUM_PATH=/usr/bin/chromium-browser`. Set
  `HTML_RENDER_DISABLED=1` to turn the feature off — conversion then falls back
  to reading the static markup, and a wholly script-built mock-up is rejected
  with instructions instead of being converted.
- **Chromium's sandbox needs kernel capabilities.** The renderer deliberately
  does *not* pass `--no-sandbox`, since the sandbox is the isolation boundary
  for untrusted uploaded code. Cloud Run's gVisor sandbox supports it; on a
  hardened runtime that does not, disable rendering rather than weakening it.
