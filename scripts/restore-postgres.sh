#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$ROOT_DIR"

if [ "${CONFIRM:-}" != "YES" ]; then
  echo "Refusing to restore. Re-run with CONFIRM=YES and a backup file:"
  echo "  CONFIRM=YES ./scripts/restore-postgres.sh backups/ie_platform_YYYYMMDDTHHMMSSZ.sql.gz"
  exit 1
fi

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Provide an existing gzip SQL dump as the first argument."
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ie_platform}"
POSTGRES_DB="${POSTGRES_DB:-ie_platform}"

echo "Stopping application processes that write to the database..."
docker compose -f "$COMPOSE_FILE" stop backend celery-worker celery-beat || true

echo "Restoring $BACKUP_FILE into $POSTGRES_DB..."
gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

echo "Starting application processes..."
docker compose -f "$COMPOSE_FILE" start backend celery-worker celery-beat

echo "Restore finished. Verify /api/v1/health/ and a login before changing DNS."
