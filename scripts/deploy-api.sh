#!/usr/bin/env bash
# Deploys the api service AND every cron service built from api/ in one go.
# The crons (event-sourcing, camp reminders, newsletter) are separate Railway
# services running scripts out of the same api/dist build; deploying only
# `api` left them on weeks-old code (2026-09-27: the weekly sourcing run was
# still on Sep 9 code and failed inserts after the Sep 20 timestamptz schema
# change). Always deploy api changes with this script.
set -euo pipefail
"$(dirname "$0")/check-ci.sh"
cd "$(dirname "$0")/../api"
for service in api event-sourcing-cron camp-reminder-cron newsletter-cron; do
  echo "== Deploying $service"
  railway up . --path-as-root --service "$service" --environment production --ci 2>&1 | tail -1
done
