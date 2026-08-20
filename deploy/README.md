# Git deploy on a Hetzner VPS

Clone this repo on the server and pull on every release. That is faster than copying files or rebuilding a Cloud Agent environment.

The trial stack is one box: Caddy, web, Django/Gunicorn, Celery, Postgres, and Redis. Expo apps stay on a laptop or EAS; do not point them at a Cloud Agent preview host.

## One-time server setup

1. Create a Hetzner CX23 or CAX11 (Ubuntu 24.04, IPv4).
2. SSH in as root and install git if needed: `apt-get update && apt-get install -y git`
3. Create a GitHub **read-only deploy key** and clone:

```bash
ssh-keygen -t ed25519 -f /root/.ssh/ie-platform-github -N "" -C "ie-platform-deploy"
cat /root/.ssh/ie-platform-github.pub
```

Add that public key in GitHub: repo → Settings → Deploy keys → Allow read access.

```bash
cat >/root/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/ie-platform-github
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts

git clone git@github.com:indiansempiregroup-beep/ie-platform.git /opt/ie-platform
cd /opt/ie-platform
./deploy/bootstrap.sh
```

4. Edit `/opt/ie-platform/.env`: replace `YOUR_VPS_IP`, `DJANGO_SECRET_KEY`, and `POSTGRES_PASSWORD` (the password must match `DATABASE_URL`).
5. Run `./deploy/bootstrap.sh` again. It installs Docker, opens ports 22/80/443, and starts the stack.

Login (when `SEED_PILOT=true`): `pilot-owner@ieplatform.local` / `PilotPass123!`  
API login path: `POST /api/v1/auth/login` (no trailing slash).

## Faster deploys after that

On the VPS:

```bash
cd /opt/ie-platform
./deploy/deploy.sh
```

That fast-forwards `main` (or `DEPLOY_BRANCH`) and rebuilds containers that changed.

### Optional: deploy on every GitHub push

In the GitHub repo:

1. Settings → Secrets and variables → Actions:
   - `HETZNER_HOST` — VPS IPv4
   - `HETZNER_USER` — `root`
   - `HETZNER_SSH_KEY` — private key that can SSH to the VPS (not the GitHub deploy key)
   - `HETZNER_SSH_PORT` — optional, defaults to 22 if omitted in the action
2. Put the matching **public** key in `/root/.ssh/authorized_keys` on the VPS.
3. Settings → Variables → Actions: `ENABLE_HETZNER_DEPLOY` = `true` to deploy on every push to `main`.
4. Until that variable is set, use Actions → **Deploy Hetzner** → Run workflow.

The workflow SSHs in and runs `./deploy/deploy.sh`. It does nothing on forks or when the variable is unset.

## HTTP trial vs HTTPS domain

| Mode | `.env` |
| --- | --- |
| IP only (trial) | `CADDY_SITE_ADDRESS=:80`, `DJANGO_SECURE_SSL_REDIRECT=false`, hosts/origins `http://YOUR_VPS_IP` |
| Domain + TLS | `CADDY_SITE_ADDRESS=app.example.com`, `ACME_EMAIL=you@example.com`, `DJANGO_SECURE_SSL_REDIRECT=true`, hosts/origins `https://app.example.com` |

Point the domain A record at the VPS before switching to TLS.

## Notes

- Do not commit `.env`. The example file is `deploy/env.production.example`.
- `docker-compose.yml` remains the **local** dev stack (host Postgres, Vite, Mailpit). Production is `docker-compose.prod.yml`.
- Changing `POSTGRES_PASSWORD` after the first start does not update an existing volume; keep the original password or recreate the `postgres-data` volume (destroys data).
- Coolify or Dokploy can also “connect GitHub” if you want a UI instead of this script. The same compose file works there.
