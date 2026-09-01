# Post-Clone Setup Runbook

Use this after cloning the repo on a **new machine** (e.g. after returning a company laptop). The private repo includes live secrets (`.env`, Firebase JSON, IMP/SSH backups under `local-backup/`) so a fresh clone is almost fully restorable.

For day-to-day commands after setup, see [`Commands to Run.txt`](../Commands%20to%20Run.txt) at the repo root.

---

## Prerequisites

Install on the new machine:

| Tool | Notes |
|------|--------|
| Git | Clone access to this private GitHub repo |
| Node.js 20+ | For `corepack` / pnpm |
| Docker Desktop | Local stack (backend, web, redis, celery, mailpit) |
| PostgreSQL | Host DB on `localhost:5432` (default dev setup) |
| Expo / EAS CLI | Only if building mobile apps (`mobile/`, `apps/ops-mobile/`) |

---

## Step 1 — Clone

```bash
git clone https://github.com/indiansempiregroup-beep/ie-orbit.git
cd ie-orbit
```

`.env` and Firebase credential files are **already in the repo** — no need to copy them from elsewhere.

---

## Step 2 — Restore IMP vault and SSH keys

The repo contains a backup of `~/Sanket/IMP` and SSH keys under `local-backup/`.

```bash
mkdir -p ~/Sanket/IMP
cp -R local-backup/IMP/* ~/Sanket/IMP/

mkdir -p ~/.ssh
cp local-backup/ssh/ie_platform_interserver ~/.ssh/
cp local-backup/ssh/ie_platform_interserver.pub ~/.ssh/
chmod 600 ~/.ssh/ie_platform_interserver
chmod 644 ~/.ssh/ie_platform_interserver.pub
```

Add the VPS host alias to `~/.ssh/config` if it is not already there:

```sshconfig
Host ie-platform-vps
    HostName <your-vps-ip>
    User root
    IdentityFile ~/.ssh/ie_platform_interserver
    IdentitiesOnly yes
```

Test:

```bash
ssh ie-platform-vps
```

See [`local-backup/IMP/README.md`](../local-backup/IMP/README.md) for what each IMP file is for.

---

## Step 3 — Install dependencies

From the **repo root**:

```bash
corepack enable
corepack pnpm install
```

If Expo reports missing modules after a reboot, run `corepack pnpm install` again from the repo root.

---

## Step 4 — Start the local stack

Ensure PostgreSQL is running on the host with database `ie_orbit` (see `.env` → `DATABASE_URL`).

```bash
docker compose up -d
```

Verify:

```bash
curl http://localhost:8000/api/v1/health/
```

Open:

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Public Vite site |
| http://localhost:8000 | Django API |
| http://localhost:8025 | Mailpit (dev email) |

Full Docker notes: [`docker/README.md`](../docker/README.md).

---

## Step 5 — Mobile / ops app (optional)

### Expo login

```bash
cd mobile
corepack pnpm exec eas login
```

Customer EAS project: `d3605998-b92a-497d-a72f-8028df3ca64d`

```bash
corepack pnpm exec eas init --id d3605998-b92a-497d-a72f-8028df3ca64d --force --non-interactive
```

Ops app (`apps/ops-mobile`): project `b897b310-e21b-49ab-b58f-56b8da1867f3`

### Local dev on phone (same Wi‑Fi)

```bash
cd mobile
export REACT_NATIVE_PACKAGER_HOSTNAME="$(ipconfig getifaddr en0)"   # macOS; use ip addr on Linux
export EXPO_PUBLIC_API_BASE_URL="http://${REACT_NATIVE_PACKAGER_HOSTNAME}:8000/api/v1"
export EXPO_PUBLIC_FLAVOR_KEY="<your-flavor-key>"
export EXPO_PUBLIC_APP_NAME="<your-app-name>"
export EXPO_NO_METRO_WORKSPACE_ROOT="1"
corepack pnpm exec expo start --port 8083 --clear --lan
```

Replace flavor key / app name from [`mobile/flavors/manifest.json`](../mobile/flavors/manifest.json) or [`docs/New-Tenant-Onboarding-Runbook.md`](New-Tenant-Onboarding-Runbook.md).

---

## Step 6 — Verify checklist

- [ ] `git pull` works with your GitHub account
- [ ] `~/Sanket/IMP` restored; `ssh ie-platform-vps` connects
- [ ] `corepack pnpm install` completed without errors
- [ ] `docker compose up -d` — backend health check returns OK
- [ ] `eas login` works (if building mobile)
- [ ] Local Expo app loads and hits API (if doing mobile dev)

---

## Adding new secrets later

**`.env` is not in git.** Keep dev values in your local `.env` (copy from [`.env.example`](../.env.example)). On the VPS, edit `/opt/ie-platform/.env` only on the server — `git pull` will not touch it.

- a new `.env` value — edit local `.env` or VPS `/opt/ie-platform/.env` directly; do not commit
- a new Firebase JSON — place under `mobile/credentials/google-services/`, commit and push
- new IMP notes or keys — update `~/Sanket/IMP`, then refresh the repo backup:

```bash
cp -R ~/Sanket/IMP local-backup/IMP
git add local-backup/IMP/
git commit -m "Refresh IMP vault backup"
git push
```

---

## VPS deploy

Production `.env` lives only on the server. After `git pull`, Compose still reads `/opt/ie-platform/.env` from disk.

```bash
ssh ie-platform-vps
cd /opt/ie-platform
git pull origin main
docker compose -p ie-platform-prod -f docker-compose.prod.yml up --build -d
docker compose -p ie-platform-prod -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput
```

---

## What is not in git (reinstall on new machine)

| Item | Restore how |
|------|-------------|
| `.env` | Copy `.env.example` → `.env` locally; on VPS use `.env.production.example` as a template once |
| `node_modules/` | `corepack pnpm install` |
| `backend/.venv/` | Recreate from backend requirements / Docker |
| Docker images / volumes | `docker compose up --build` |
| EAS Android keystores | Expo cloud (after `eas init`) |
| `backend/celerybeat-schedule*` | Auto-generated at runtime; ignore |

---

## Production URLs (reference)

| URL | Purpose |
|-----|---------|
| https://ie-orbit.com | Public website |
| https://app.ie-orbit.com | Platform Admin |
| https://ops.ie-orbit.com | Ops workspace (owners/staff) |
| https://api.ie-orbit.com | Production API |
