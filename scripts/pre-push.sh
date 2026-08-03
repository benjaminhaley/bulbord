#!/bin/sh
# Fast local check before pushing — lint + typecheck only, not the full unit/e2e
# suite CI runs (see CLAUDE.md's Testing section). Install once with:
#   ln -sf ../../scripts/pre-push.sh .git/hooks/pre-push

set -e

echo "pre-push: format.ts parity (web <-> api)"
node scripts/check-format-parity.mjs

echo "pre-push: api typecheck"
(cd api && npm run typecheck)

echo "pre-push: web lint + typecheck"
(cd web && npm run lint && npm run typecheck)
