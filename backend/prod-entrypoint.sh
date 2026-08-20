#!/bin/sh
set -eu

python manage.py migrate --noinput

if [ "${SEED_PILOT:-false}" = "true" ]; then
  python manage.py seed_white_label_profiles --create-pilot --all-businesses
fi

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-2}" \
  --timeout 60
