#!/usr/bin/env bash
# Post-deploy QA — run after VPS deploy (and optionally after EAS APK install).
# Usage:
#   cp e2e/.env.example e2e/.env   # fill from ~/Sanket/IMP/ie-orbit-qa-credentials.md
#   ./scripts/qa-post-deploy.sh
#   ./scripts/qa-post-deploy.sh --skip-maestro
#   ./scripts/qa-post-deploy.sh --playwright-only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_MAESTRO=0
PLAYWRIGHT_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --skip-maestro) SKIP_MAESTRO=1 ;;
    --playwright-only) PLAYWRIGHT_ONLY=1; SKIP_MAESTRO=1 ;;
    -h|--help)
      echo "Usage: $0 [--skip-maestro] [--playwright-only]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f e2e/.env ]]; then
  echo "Missing e2e/.env — copy e2e/.env.example and fill credentials from IMP vault." >&2
  exit 1
fi

echo "==> Playwright (web + ops web) against production URLs"
corepack pnpm install
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e

if [[ "$SKIP_MAESTRO" -eq 1 ]]; then
  echo "==> Skipping Maestro (--skip-maestro)"
  echo "Done. Report: playwright-report/ (pnpm test:e2e:report)"
  exit 0
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI not installed — skipping native flows. See docs/qa/automation.md" >&2
  exit 0
fi

# shellcheck disable=SC1091
set -a
source e2e/.env
set +a

if [[ -z "${QA_OWNER_EMAIL:-}" || -z "${QA_OWNER_PASSWORD:-}" ]]; then
  echo "QA_OWNER_* not set — skipping ops Maestro flows" >&2
else
  echo "==> Maestro ops-mobile smoke"
  maestro test apps/ops-mobile/.maestro/smoke/
fi

if [[ -z "${QA_CUSTOMER_EMAIL:-}" || -z "${QA_CUSTOMER_PASSWORD:-}" ]]; then
  echo "QA_CUSTOMER_* not set — skipping customer Maestro flows" >&2
else
  APP_ID="${MAESTRO_CUSTOMER_APP_ID:-com.ieorbit.mobile.dev}"
  echo "==> Maestro customer mobile smoke (APP_ID=$APP_ID)"
  export APP_ID
  maestro test mobile/.maestro/smoke/
fi

echo "Done. Triage failures in docs/qa/FINDINGS.md"
echo "Playwright report: pnpm test:e2e:report"
