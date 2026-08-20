#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing $ROOT/.env"
  echo "Copy deploy/env.production.example to .env, set YOUR_VPS_IP and secrets, then re-run."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

if [[ "${SKIP_GIT_PULL:-false}" != "true" ]]; then
  if [[ -d .git ]]; then
    git fetch origin
    git checkout "$DEPLOY_BRANCH"
    git pull --ff-only origin "$DEPLOY_BRANCH"
  else
    echo "Not a git checkout at $ROOT; skipping git pull."
  fi
fi

"${COMPOSE[@]}" up -d --build --remove-orphans
"${COMPOSE[@]}" ps
echo "Deploy finished. Health: http://${DJANGO_ALLOWED_HOSTS%%,*}/api/v1/health/"
