#!/bin/sh
set -eu

CERT_DIR=/etc/nginx/certs
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "No TLS certificate mounted; generating a self-signed certificate for local/boot use."
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=${API_HOST:-localhost}"
fi
