#!/usr/bin/env bash
# Refuses to deploy while CI on main is red. Checks the most recent
# *completed* CI run (the push you just made is usually still running, so
# this covers everything up to the previous push). Set FORCE_DEPLOY=1 to
# deploy anyway (e.g. a hotfix for the very thing that's failing).
#
# Why: from 2026-09-21 to 09-27 the e2e job failed on ~15 consecutive pushes
# while every Railway deploy succeeded and the live site looked fine, so
# nobody noticed (see CLAUDE.md's Deploying note).
set -euo pipefail

if [[ "${FORCE_DEPLOY:-}" == "1" ]]; then
  echo "FORCE_DEPLOY=1: skipping the CI check."
  exit 0
fi
if ! command -v gh >/dev/null; then
  echo "Can't check CI: the gh CLI isn't installed. Set FORCE_DEPLOY=1 to deploy anyway." >&2
  exit 1
fi

run=$(gh run list --workflow ci.yml --branch main --status completed --limit 1 \
  --json conclusion,headSha,displayTitle,url --jq '.[0] | "\(.conclusion)\t\(.headSha[0:7])\t\(.displayTitle)\t\(.url)"')
if [[ -z "$run" ]]; then
  echo "Can't check CI: no completed CI run found on main. Set FORCE_DEPLOY=1 to deploy anyway." >&2
  exit 1
fi
IFS=$'\t' read -r conclusion sha title url <<<"$run"

if [[ "$conclusion" != "success" ]]; then
  echo "CI on main is red — not deploying." >&2
  echo "  Latest completed run: $conclusion at $sha ($title)" >&2
  echo "  $url" >&2
  echo "Fix CI first, or set FORCE_DEPLOY=1 to deploy anyway." >&2
  exit 1
fi
echo "CI on main is green (latest completed run: $sha)."

in_progress=$(gh run list --workflow ci.yml --branch main --status in_progress --limit 1 --json headSha --jq '.[0].headSha[0:7] // empty')
if [[ -n "$in_progress" ]]; then
  echo "Note: CI for $in_progress is still running — check it with 'gh run watch' after this deploy."
fi
