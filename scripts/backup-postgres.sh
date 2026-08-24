#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_NAME="ie_platform_${TIMESTAMP}.sql.gz"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ie_platform}"
POSTGRES_DB="${POSTGRES_DB:-ie_platform}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-backups/postgres}"

mkdir -p "$BACKUP_DIR"

echo "Dumping PostgreSQL from the postgres service..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --format=plain \
  | gzip > "$BACKUP_PATH"

echo "Wrote local backup $BACKUP_PATH"

if [ -n "${BACKUP_LOCAL_RETENTION_DAYS:-}" ]; then
  find "$BACKUP_DIR" -name 'ie_platform_*.sql.gz' -type f -mtime "+${BACKUP_LOCAL_RETENTION_DAYS}" -delete
  echo "Pruned local backups older than ${BACKUP_LOCAL_RETENTION_DAYS} days. Remote backups are never deleted."
fi

ENDPOINT="${BACKUP_S3_ENDPOINT:-${R2_ENDPOINT:-}}"
ACCESS_KEY="${BACKUP_S3_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
SECRET_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
BUCKET="${BACKUP_S3_BUCKET:-${R2_BUCKET_NAME:-}}"
REGION="${BACKUP_S3_REGION:-${R2_REGION:-auto}}"

if [ -z "$ENDPOINT" ] || [ -z "$ACCESS_KEY" ] || [ -z "$SECRET_KEY" ] || [ -z "$BUCKET" ]; then
  echo "Skipping object-storage upload because R2/BACKUP_S3 credentials are incomplete."
  exit 0
fi

OBJECT_KEY="${BACKUP_S3_PREFIX%/}/$BACKUP_NAME"
echo "Uploading $BACKUP_NAME to $BUCKET/$OBJECT_KEY"

docker compose -f "$COMPOSE_FILE" cp "$BACKUP_PATH" backend:/tmp/backup.sql.gz
docker compose -f "$COMPOSE_FILE" exec -T \
  -e R2_ENDPOINT="$ENDPOINT" \
  -e R2_ACCESS_KEY_ID="$ACCESS_KEY" \
  -e R2_SECRET_ACCESS_KEY="$SECRET_KEY" \
  -e R2_BUCKET_NAME="$BUCKET" \
  -e R2_REGION="$REGION" \
  -e OBJECT_KEY="$OBJECT_KEY" \
  backend python -c "
import os
from pathlib import Path
import boto3
from botocore.config import Config
client = boto3.client(
    's3',
    endpoint_url=os.environ['R2_ENDPOINT'],
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    region_name=os.environ.get('R2_REGION') or 'auto',
    config=Config(signature_version='s3v4', s3={'addressing_style': 'path'}),
)
client.put_object(
    Bucket=os.environ['R2_BUCKET_NAME'],
    Key=os.environ['OBJECT_KEY'],
    Body=Path('/tmp/backup.sql.gz').read_bytes(),
    ContentType='application/gzip',
)
print('Remote backup upload complete. Remote backups are never deleted by this script.')
"

