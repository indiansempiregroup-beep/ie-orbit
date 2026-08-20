#!/usr/bin/env bash
set -euo pipefail

# First-time Hetzner/Ubuntu setup. Run as root from a cloned checkout:
#   cd /opt/ie-platform && ./deploy/bootstrap.sh

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GIT_REPO="${GIT_REPO:-git@github.com:indiansempiregroup-beep/ie-platform.git}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/ie-platform}"
DEPLOY_KEY="${DEPLOY_KEY:-/root/.ssh/ie-platform-github}"

if [[ -d "$SCRIPT_ROOT/.git" ]]; then
  DEPLOY_DIR="$SCRIPT_ROOT"
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (sudo)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if [[ ! -f "$DEPLOY_KEY" ]]; then
  ssh-keygen -t ed25519 -f "$DEPLOY_KEY" -N "" -C "ie-platform-deploy"
fi

mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [[ ! -f /root/.ssh/config ]] || ! grep -q "IdentityFile $DEPLOY_KEY" /root/.ssh/config; then
  cat >> /root/.ssh/config <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile $DEPLOY_KEY
  IdentitiesOnly yes
EOF
  chmod 600 /root/.ssh/config
fi
ssh-keyscan -t ed25519,rsa github.com >> /root/.ssh/known_hosts 2>/dev/null || true
sort -u /root/.ssh/known_hosts -o /root/.ssh/known_hosts

echo
echo "Add this read-only GitHub deploy key (repo → Settings → Deploy keys):"
echo "-----"
cat "${DEPLOY_KEY}.pub"
echo "-----"
echo

if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
  if ! git clone "$GIT_REPO" "$DEPLOY_DIR"; then
    echo "Clone failed. Add the deploy key above, then re-run: $0"
    exit 1
  fi
fi

cd "$DEPLOY_DIR"
chmod +x deploy/bootstrap.sh deploy/deploy.sh

if [[ ! -f .env ]]; then
  cp deploy/env.production.example .env
  echo "Created $DEPLOY_DIR/.env from the example. Edit it (IP, DJANGO_SECRET_KEY, POSTGRES_PASSWORD), then re-run this script."
  exit 0
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

./deploy/deploy.sh
echo
echo "Bootstrap complete. Open http://<your-vps-ip>/ and POST /api/v1/auth/login"
echo "Pilot login (if SEED_PILOT=true): pilot-owner@ieplatform.local / PilotPass123!"
