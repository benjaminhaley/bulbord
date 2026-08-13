#!/bin/sh
# Local check before pushing — lint + typecheck + both unit suites (api, web).
# e2e stays CI-only (Playwright browser spin-up is too slow for every push).
# A broken unit test used to only surface in CI, after the push (and
# sometimes after a deploy) already happened — this closes that gap so it
# can't leave the machine at all. Install once with:
#   ln -sf ../../scripts/pre-push.sh .git/hooks/pre-push

set -e

echo "pre-push: format.ts parity (web <-> api)"
node scripts/check-format-parity.mjs

echo "pre-push: api typecheck"
(cd api && npm run typecheck)

echo "pre-push: web lint + typecheck"
(cd web && npm run lint && npm run typecheck)

echo "pre-push: api unit tests"
(cd api && npx vitest run)

echo "pre-push: web unit tests"
(cd web && npx vitest run)
