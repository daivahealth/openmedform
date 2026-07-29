#!/usr/bin/env bash
#
# Same-origin HTTPS Load Balancer for OpenMedForm (issue #26, custom domain).
# Cloud Run domain mappings are NOT available in asia-south1, so a global
# external Application Load Balancer fronts both services:
#
#   openmedform.daiva.health       -> openmedform-web  (default)
#   openmedform.daiva.health/api/* -> openmedform-api  (path rule)
#
# Creates: static IP, serverless NEGs, backend services, URL map, managed
# cert, HTTPS proxy + forwarding rule, and an HTTP->HTTPS redirect.
# Idempotent — safe to re-run. Cost: ~$18-25/mo (forwarding rules + LB).
#
# Usage:
#   export GCP_PROJECT_ID=project-bd21c1d3-4652-447f-a1b
#   export GCP_REGION=asia-south1
#   export DOMAIN=openmedform.daiva.health
#   ./scripts/gcp-lb-setup.sh

set -euo pipefail

: "${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
: "${GCP_REGION:?set GCP_REGION}"
: "${DOMAIN:?set DOMAIN (e.g. openmedform.daiva.health)}"

NAME="openmedform"
gcloud config set project "${GCP_PROJECT_ID}" --quiet

echo "==> Enabling Compute API"
gcloud services enable compute.googleapis.com

echo "==> Static global IP: ${NAME}-lb-ip"
gcloud compute addresses create "${NAME}-lb-ip" --global 2>/dev/null || echo "    (already exists)"
LB_IP="$(gcloud compute addresses describe "${NAME}-lb-ip" --global --format='value(address)')"
echo "    IP: ${LB_IP}"

echo "==> Serverless NEGs"
gcloud compute network-endpoint-groups create "${NAME}-web-neg" \
  --region="${GCP_REGION}" --network-endpoint-type=serverless \
  --cloud-run-service=openmedform-web 2>/dev/null || echo "    web NEG already exists"
gcloud compute network-endpoint-groups create "${NAME}-api-neg" \
  --region="${GCP_REGION}" --network-endpoint-type=serverless \
  --cloud-run-service=openmedform-api 2>/dev/null || echo "    api NEG already exists"

echo "==> Backend services"
# NOTE: do NOT set a custom --timeout here — a non-default timeoutSec is
# rejected for backend services with serverless NEGs (add-backend fails).
# Through the LB, request length is governed by Cloud Run's own timeout.
gcloud compute backend-services create "${NAME}-web-backend" --global \
  --load-balancing-scheme=EXTERNAL_MANAGED 2>/dev/null || echo "    web backend already exists"
gcloud compute backend-services create "${NAME}-api-backend" --global \
  --load-balancing-scheme=EXTERNAL_MANAGED 2>/dev/null || echo "    api backend already exists"
gcloud compute backend-services add-backend "${NAME}-web-backend" --global \
  --network-endpoint-group="${NAME}-web-neg" \
  --network-endpoint-group-region="${GCP_REGION}" 2>/dev/null || echo "    web backend already attached"
gcloud compute backend-services add-backend "${NAME}-api-backend" --global \
  --network-endpoint-group="${NAME}-api-neg" \
  --network-endpoint-group-region="${GCP_REGION}" 2>/dev/null || echo "    api backend already attached"

echo "==> URL map (default -> web, /api/* -> api)"
gcloud compute url-maps create "${NAME}-url-map" --global \
  --default-service="${NAME}-web-backend" 2>/dev/null || echo "    url map already exists"
gcloud compute url-maps add-path-matcher "${NAME}-url-map" --global \
  --path-matcher-name=api-matcher \
  --default-service="${NAME}-web-backend" \
  --path-rules="/api/*=${NAME}-api-backend" 2>/dev/null || echo "    path matcher already exists"

echo "==> Managed SSL certificate for ${DOMAIN}"
gcloud compute ssl-certificates create "${NAME}-cert" --global \
  --domains="${DOMAIN}" 2>/dev/null || echo "    cert already exists"

echo "==> HTTPS proxy + forwarding rule (443)"
gcloud compute target-https-proxies create "${NAME}-https-proxy" --global \
  --url-map="${NAME}-url-map" --ssl-certificates="${NAME}-cert" 2>/dev/null || echo "    https proxy already exists"
gcloud compute forwarding-rules create "${NAME}-https-rule" --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --target-https-proxy="${NAME}-https-proxy" \
  --address="${NAME}-lb-ip" --ports=443 2>/dev/null || echo "    443 rule already exists"

echo "==> HTTP -> HTTPS redirect (80)"
# NOTE: `gcloud compute url-maps import` does not reliably create/apply
# redirect-only maps, and this gcloud version has no default-url-redirect
# create flags — so create a dummy map, then replace it via the REST API.
REDIRECT_MAP="${NAME}-http-redirect"
gcloud compute url-maps create "${REDIRECT_MAP}" --global \
  --default-service="${NAME}-web-backend" 2>/dev/null || echo "    redirect map already exists"
BASE="https://compute.googleapis.com/compute/v1/projects/${GCP_PROJECT_ID}/global/urlMaps/${REDIRECT_MAP}"
TOKEN="$(gcloud auth print-access-token)"
if ! curl -sf -H "Authorization: Bearer ${TOKEN}" "${BASE}" | grep -q defaultUrlRedirect; then
  curl -sf -H "Authorization: Bearer ${TOKEN}" "${BASE}" \
    | python3 -c '
import json,sys
m=json.load(sys.stdin)
m.pop("defaultService",None)
m["defaultUrlRedirect"]={"httpsRedirect":True,"redirectResponseCode":"MOVED_PERMANENTLY_DEFAULT"}
json.dump(m,sys.stdout)' > /tmp/urlmap-put.json
  curl -sf -X PUT -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d @/tmp/urlmap-put.json "${BASE}" > /dev/null
  rm -f /tmp/urlmap-put.json
fi
gcloud compute target-http-proxies create "${NAME}-http-proxy" --global \
  --url-map="${REDIRECT_MAP}" 2>/dev/null || echo "    http proxy already exists"
gcloud compute forwarding-rules create "${NAME}-http-rule" --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --target-http-proxy="${NAME}-http-proxy" \
  --address="${NAME}-lb-ip" --ports=80 2>/dev/null || echo "    80 rule already exists"

cat <<EOF

==> Load balancer created. Next steps:

1. DNS (Netlify DNS for daiva.health) — add ONE record:
     Type: A    Name: openmedform    Value: ${LB_IP}

2. Wait for the managed cert to provision (starts once DNS resolves,
   typically ~15 min):
     gcloud compute ssl-certificates describe ${NAME}-cert --global \\
       --format='value(managed.status)'

3. App config to point at the domain:
   - Secrets: FRONTEND_ORIGIN=https://${DOMAIN},
     callback URL = https://${DOMAIN}/api/auth/google/callback
   - Google OAuth client: add that callback as an authorized redirect URI
   - GitHub vars: API_URL=https://${DOMAIN}, WEB_URL=https://${DOMAIN}
     (same origin — web calls /api on itself)
   - Rebuild + redeploy web with NEXT_PUBLIC_API_URL=https://${DOMAIN},
     roll a new API revision to pick up the new secret versions.
EOF
