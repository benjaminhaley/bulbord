#!/usr/bin/env bash
# Points every app service at the images CI just built and deploys them all at
# once (called by .github/workflows/ci.yml's deploy job, after every test job
# passed). Railway only pulls and starts a prebuilt image — no build — so this
# takes about a minute instead of rebuilding from source per service.
#
# Env: IMAGE_TAG (git sha) and either RAILWAY_TOKEN (a project token for
# bulbord/production — what CI uses) or RAILWAY_API_TOKEN (an account token,
# for running this by hand).
set -euo pipefail
: "${IMAGE_TAG:?IMAGE_TAG is not set}"
if [ -n "${RAILWAY_TOKEN:-}" ]; then
  AUTH_HEADER="Project-Access-Token: $RAILWAY_TOKEN"
elif [ -n "${RAILWAY_API_TOKEN:-}" ]; then
  AUTH_HEADER="Authorization: Bearer $RAILWAY_API_TOKEN"
else
  echo "Set RAILWAY_TOKEN or RAILWAY_API_TOKEN" >&2
  exit 1
fi

ENV_ID=f4f06cfd-89cf-42c4-8978-e38809776236 # production
REGISTRY=ghcr.io/benjaminhaley
# service name -> service id -> image. The crons run the api image with their
# own start command (set on the service in Railway).
SERVICES=(
  "api c5671a73-c5cb-4995-b0c0-0340ab7b0ef9 bulbord-api"
  "event-sourcing-cron bb5f7274-bae5-4555-99fa-53722a9c7a43 bulbord-api"
  "camp-reminder-cron 6f966d64-2b3e-43c2-9925-01aead299f5b bulbord-api"
  "newsletter-cron 6c48e31b-849f-4bff-a662-9e5d99bcac7f bulbord-api"
  "web 24c4d855-a6ab-4ee6-872a-7d25c25ed78c bulbord-web"
)

gql() {
  local body
  body=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1")
  local out
  out=$(curl -sS --fail-with-body https://backboard.railway.com/graphql/v2 \
    -H "$AUTH_HEADER" -H 'Content-Type: application/json' -d "$body")
  if echo "$out" | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("errors") else 1)'; then
    echo "Railway API error: $out" >&2
    return 1
  fi
  echo "$out"
}

declare -A DEPLOYMENTS
for row in "${SERVICES[@]}"; do
  read -r name id image <<<"$row"
  ref="$REGISTRY/$image:$IMAGE_TAG"
  gql "mutation { serviceInstanceUpdate(serviceId: \"$id\", environmentId: \"$ENV_ID\", input: { source: { image: \"$ref\" } }) }" >/dev/null
  dep=$(gql "mutation { serviceInstanceDeployV2(serviceId: \"$id\", environmentId: \"$ENV_ID\") }" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["serviceInstanceDeployV2"])')
  DEPLOYMENTS[$name]=$dep
  echo "$name: deploying $ref ($dep)"
done

# Wait for every deployment to settle. SLEEPING is a cron service's normal
# resting state between runs.
deadline=$((SECONDS + 600))
failed=0
for name in "${!DEPLOYMENTS[@]}"; do
  while :; do
    status=$(gql "query { deployment(id: \"${DEPLOYMENTS[$name]}\") { status } }" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["deployment"]["status"])')
    case "$status" in
      SUCCESS|SLEEPING) echo "$name: $status"; break ;;
      FAILED|CRASHED|REMOVED|SKIPPED) echo "$name: $status" >&2; failed=1; break ;;
    esac
    if ((SECONDS > deadline)); then echo "$name: still $status after 10 min" >&2; failed=1; break; fi
    sleep 5
  done
done
exit $failed
