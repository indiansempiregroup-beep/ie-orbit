#!/bin/sh
# Copy Let's Encrypt live certs into the nginx bind mount and reload.
set -eu
LIVE="${LETSENCRYPT_LIVE:-/etc/letsencrypt/live/ie-orbit.com}"
DEST="${CERT_DEST:-/opt/ie-platform/certs}"
install -m 644 "$LIVE/fullchain.pem" "$DEST/fullchain.pem"
install -m 600 "$LIVE/privkey.pem" "$DEST/privkey.pem"
docker compose -p ie-platform-prod -f /opt/ie-platform/docker-compose.prod.yml exec -T nginx nginx -s reload
