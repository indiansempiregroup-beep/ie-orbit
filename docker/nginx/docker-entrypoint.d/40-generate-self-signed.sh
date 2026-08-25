#!/bin/sh
set -eu

CERT_DIR=/etc/nginx/certs
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "No TLS certificate mounted; generating a self-signed certificate for local/boot use."
  api_host="${API_HOST:-localhost}"
  web_host="${WEB_HOST:-localhost}"
  ops_host="${OPS_WEB_HOST:-localhost}"
  site_host="${SITE_HOST:-localhost}"
  www_host="${WWW_HOST:-localhost}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=${site_host}" \
    -addext "subjectAltName=DNS:${api_host},DNS:${web_host},DNS:${ops_host},DNS:${site_host},DNS:${www_host},DNS:localhost"
fi
