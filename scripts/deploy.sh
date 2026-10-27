#!/usr/bin/env bash
# Production deploys happen in CI: every push to main builds images alongside
# the tests, and the `deploy` job ships them once every check passes (see
# .github/workflows/ci.yml). This script just waits for that to finish for the
# commit you pushed and reports whether it went live.
set -euo pipefail
sha=$(git rev-parse HEAD)
git fetch -q origin main
if [ "$(git rev-parse origin/main)" != "$sha" ]; then
  echo "HEAD ($sha) isn't origin/main — push it first: git push origin HEAD:main" >&2
  exit 1
fi
run=""
for _ in $(seq 1 30); do
  run=$(gh run list --branch main --workflow ci.yml --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$run" ] && break
  sleep 2
done
[ -n "$run" ] || { echo "No CI run found for $sha" >&2; exit 1; }
echo "Watching CI run $run for $sha"
gh run watch "$run" --exit-status --interval 10 >/dev/null || true
result=$(gh run view "$run" --json jobs --jq '.jobs[] | select(.name == "deploy") | .conclusion')
gh run view "$run" --json jobs --jq '.jobs[] | "  \(.name): \(.conclusion)"'
if [ "$result" = "success" ]; then
  echo "Deployed $sha"
else
  echo "Not deployed (deploy job: ${result:-missing}) — see: gh run view $run --log-failed" >&2
  exit 1
fi
