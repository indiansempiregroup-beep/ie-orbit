# Docker Development Platform

This repository now includes a Docker-based local development platform for the full IE Platform stack.

## Quick start

```bash
docker compose up --build
```

The stack includes:

- Django backend on http://localhost:8000
- Vite web app on http://localhost:3000
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

For the default development workflow, the compose stack uses the single project environment file at .env. The backend expects a Neon PostgreSQL connection string via DATABASE_URL.

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

- If the backend cannot connect to the database, confirm DATABASE_URL points to a valid Neon PostgreSQL URL.
- If the web app does not hot reload, ensure Docker Desktop file sharing is enabled and the repository is mounted correctly.
- If the web container exits early, inspect logs with docker compose logs web.
