#!/usr/bin/env bash
# Deploys the web service, after checking CI on main isn't red.
set -euo pipefail
"$(dirname "$0")/check-ci.sh"
cd "$(dirname "$0")/../web"
echo "== Deploying web"
railway up . --path-as-root --service web --environment production --ci 2>&1 | tail -1
