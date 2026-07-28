#!/usr/bin/env bash
#
# One-time GCP setup for OpenMedForm production deployment (issue #26).
# Creates: enabled APIs, Artifact Registry repo, deploy + runtime service
# accounts, Workload Identity Federation (keyless GitHub Actions auth), and
# Secret Manager entries. Idempotent — safe to re-run.
#
# Prerequisites: gcloud CLI authenticated with an owner/editor account.
#
# Usage:
#   export GCP_PROJECT_ID=my-project
#   export GCP_REGION=us-central1
#   export GITHUB_REPO=daivahealth/openmedform
#   ./scripts/gcp-setup.sh
#
# After running, set the printed values as GitHub Actions variables and fill
# the Secret Manager values (step 7 output). See docs/deployment/GCP-CLOUD-RUN.md.

set -euo pipefail

: "${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
: "${GCP_REGION:?set GCP_REGION (e.g. us-central1)}"
: "${GITHUB_REPO:?set GITHUB_REPO (e.g. daivahealth/openmedform)}"

AR_REPO="openmedform"
DEPLOY_SA="github-deploy"
RUNTIME_SA="openmedform-runtime"
WIF_POOL="github-actions"
WIF_PROVIDER="github"

SECRETS=(
  DATABASE_URL
  JWT_SECRET
  AI_ENCRYPTION_KEY
  FRONTEND_ORIGIN
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_CALLBACK_URL
)

echo "==> Project: ${GCP_PROJECT_ID}  Region: ${GCP_REGION}  Repo: ${GITHUB_REPO}"
gcloud config set project "${GCP_PROJECT_ID}"

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com

echo "==> Artifact Registry repo: ${AR_REPO}"
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${GCP_REGION}" \
  --description="OpenMedForm container images" 2>/dev/null || echo "    (already exists)"

echo "==> Service accounts"
gcloud iam service-accounts create "${DEPLOY_SA}" \
  --display-name="GitHub Actions deploy" 2>/dev/null || echo "    ${DEPLOY_SA} already exists"
gcloud iam service-accounts create "${RUNTIME_SA}" \
  --display-name="OpenMedForm Cloud Run runtime" 2>/dev/null || echo "    ${RUNTIME_SA} already exists"

DEPLOY_SA_EMAIL="${DEPLOY_SA}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA_EMAIL="${RUNTIME_SA}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Deploy SA roles (Cloud Run admin, AR writer, act-as runtime SA)"
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" --role="roles/run.admin" --quiet
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" --role="roles/artifactregistry.writer" --quiet
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA_EMAIL}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" --role="roles/iam.serviceAccountUser" --quiet

echo "==> Workload Identity Federation pool + provider"
gcloud iam workload-identity-pools create "${WIF_POOL}" \
  --location=global --display-name="GitHub Actions" 2>/dev/null || echo "    pool already exists"
gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
  --location=global \
  --workload-identity-pool="${WIF_POOL}" \
  --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" 2>/dev/null || echo "    provider already exists"

PROJECT_NUMBER="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"
WIF_PROVIDER_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"

echo "==> Allow GitHub repo ${GITHUB_REPO} to impersonate deploy SA"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" \
  --quiet

echo "==> Secret Manager entries (placeholder values — update afterwards!)"
for name in "${SECRETS[@]}"; do
  if ! gcloud secrets describe "${name}" >/dev/null 2>&1; then
    echo -n "CHANGE_ME" | gcloud secrets create "${name}" \
      --replication-policy=automatic --data-file=-
  else
    echo "    ${name} already exists"
  fi
  gcloud secrets add-iam-policy-binding "${name}" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" --quiet
done

cat <<EOF

==> Done. Next steps:

1. Set these GitHub Actions variables (repo Settings > Secrets and variables > Actions > Variables):
     GCP_PROJECT_ID=${GCP_PROJECT_ID}
     GCP_REGION=${GCP_REGION}
     GCP_WORKLOAD_IDENTITY_PROVIDER=${WIF_PROVIDER_NAME}
     GCP_SERVICE_ACCOUNT=${DEPLOY_SA_EMAIL}
     API_URL=https://api.<your-domain>
     WEB_URL=https://app.<your-domain>

2. Fill real secret values, e.g.:
     echo -n "postgres://..." | gcloud secrets versions add DATABASE_URL --data-file=-
   Secrets to fill: ${SECRETS[*]}
   Generate strong values for JWT_SECRET and AI_ENCRYPTION_KEY, e.g.:
     openssl rand -hex 32

3. Create the Supabase project and set DATABASE_URL to the direct :5432
   connection string. Migrations run automatically on API boot
   (prisma migrate deploy in apps/api/Dockerfile CMD).

4. Create the Google OAuth client (see docs/deployment/GCP-CLOUD-RUN.md §3)
   and set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL.

5. Push to main — .github/workflows/deploy.yml builds and deploys both services.

6. Map custom domains (Cloud Run domain mappings or a load balancer) and then
   update FRONTEND_ORIGIN + GOOGLE_CALLBACK_URL to the final URLs.
EOF
