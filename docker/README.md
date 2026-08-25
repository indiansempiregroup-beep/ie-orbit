# Docker Development Platform

This repository now includes a Docker-based local development platform for the full IE Orbit stack.

## Quick start

```bash
docker compose up --build
```

The stack includes:

- Django backend on http://localhost:8000
- Vite public site on http://localhost:3000
- Platform Admin on http://127.0.0.1:3000 (after platform-admin sign-in)
- Expo ops web (host, not Compose): http://localhost:8082
- Host PostgreSQL on localhost:5432 (not run in Compose)
- Redis on localhost:6379
- Mailpit web UI on http://localhost:8025
- Celery worker and beat services

## Services

- backend: Django + Gunicorn-ready container with development server support
- web: Vite dev server with hot reload
- redis: persistent Redis instance with health checks
- celery-worker: Celery worker
- celery-beat: Celery beat scheduler
- mailpit: SMTP capture and web UI

## Environment

Copy the example env file before first use:

```bash
cp .env.example .env
```

For the default development workflow, the compose stack uses the project `.env` file. Host Postgres is the default:

```text
DATABASE_URL=postgresql://postgres:admin@host.docker.internal:5432/ie_orbit
```

Use `localhost` instead of `host.docker.internal` if you run Django on the host outside Docker. To use Neon instead, replace `DATABASE_URL` with your Neon pooler connection string.

## Helper scripts

- scripts/dev-up.sh / scripts/dev-up.ps1
- scripts/dev-down.sh / scripts/dev-down.ps1
- scripts/dev-reset.sh / scripts/dev-reset.ps1
- scripts/dev-logs.sh / scripts/dev-logs.ps1
- scripts/dev-shell.sh / scripts/dev-shell.ps1
- scripts/backend-shell.sh / scripts/backend-shell.ps1
- scripts/web-shell.sh / scripts/web-shell.ps1
- scripts/celery-shell.sh / scripts/celery-shell.ps1
- scripts/test.sh / scripts/test.ps1

## Troubleshooting

- If the backend cannot connect to the database, confirm local Postgres is running on port 5432 and `DATABASE_URL` uses `host.docker.internal` from Compose (or `localhost` on the host).
- If the web app does not hot reload, ensure Docker Desktop file sharing is enabled and the repository is mounted correctly.
- If the web container exits early, inspect logs with docker compose logs web.

## Production

Local Compose is unchanged. Production uses a separate file and does not publish Postgres or Redis:

```bash
cp .env.production.example .env
docker compose -f docker-compose.prod.yml up --build -d
```

Production nginx serves:

- https://ie-orbit.com — public marketing / register / sign-in
- https://app.ie-orbit.com — Platform Admin (after platform-admin login)
- https://ops.ie-orbit.com — Expo ops workspace (owners and staff)
- https://api.ie-orbit.com — Django API

Add DNS A records for `@`, `www`, `app`, `ops`, and `api` to the VPS. `www` redirects to the apex site.

Canonical runbooks live in the sibling `ie-orbit-docs` repository under `docs/09-devops/`:

- IE-0901 Production Infrastructure Architecture
- OPS-001 InterServer Deployment
- OPS-002 PostgreSQL Backup and Restore
- OPS-003 VPS Security Baseline
- OPS-004 Compute Provider Migration

Backup helpers:

- `scripts/backup-postgres.sh`
- `scripts/restore-postgres.sh` (requires `CONFIRM=YES`)

