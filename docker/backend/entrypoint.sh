#!/bin/sh
set -eu

mkdir -p /app/backend/staticfiles /app/backend/logs /app/backend/media /var/lib/celery
chown -R appuser:appuser /app/backend/staticfiles /app/backend/logs /app/backend/media /var/lib/celery || true

wait_for_postgres() {
  python - <<'PY'
import os
import socket
import time
from urllib.parse import urlparse

url = os.environ.get("DATABASE_URL", "")
parsed = urlparse(url)
host = parsed.hostname or "postgres"
port = parsed.port or 5432
deadline = time.time() + 60
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            raise SystemExit(0)
    except OSError:
        time.sleep(1)
raise SystemExit(f"Postgres is not reachable at {host}:{port}")
PY
}

role="${1:-web}"

if [ "$(id -u)" = "0" ]; then
  exec gosu appuser "$0" "$role"
fi

wait_for_postgres

case "$role" in
  web)
    python manage.py migrate --noinput
    python manage.py collectstatic --noinput
    exec gunicorn config.wsgi:application \
      --bind 0.0.0.0:8000 \
      --workers "${GUNICORN_WORKERS:-2}" \
      --threads "${GUNICORN_THREADS:-2}" \
      --timeout 60 \
      --access-logfile - \
      --error-logfile -
    ;;
  worker)
    exec celery -A config.celery worker --loglevel=info --concurrency="${CELERY_CONCURRENCY:-1}"
    ;;
  beat)
    exec celery -A config.celery beat --loglevel=info --schedule=/var/lib/celery/celerybeat-schedule
    ;;
  *)
    exec "$@"
    ;;
esac
