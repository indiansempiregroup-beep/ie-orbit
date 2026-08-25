# Docker Developer Guide

## One-command start

```bash
docker compose up --build
```

## Default services

- Backend: http://localhost:8000
- API docs: http://localhost:8000/api/docs/
- Health: http://localhost:8000/api/health/
- Web app (public site): http://localhost:3000
- Platform Admin: http://127.0.0.1:3000 (after platform-admin sign-in)
- Ops Expo web: http://localhost:8082 (`cd apps/ops-mobile && corepack pnpm web`)
- Mailpit UI: http://localhost:8025
- Postgres: host Postgres on localhost:5432 (`postgres` / `admin` / `ie_orbit`)

## Notes

- Host PostgreSQL is the default development database (not run in Compose).
- Backend startup runs migrations and the pilot seed automatically.
- Keep a Neon URL in `DATABASE_URL` only when you intentionally want a remote DB.
- The compose stack uses Redis for cache and Celery broker state.
- The backend uses mounted source code for live reload in development.
- The web app uses Vite with host binding for Docker compatibility.

## Switch database

- Local (default): `DATABASE_URL=postgresql://postgres:admin@host.docker.internal:5432/ie_orbit`
- Host Django (outside Docker): `DATABASE_URL=postgresql://postgres:admin@localhost:5432/ie_orbit`
- Neon: paste your Neon pooler URL into `.env` as `DATABASE_URL`
- After changing `DATABASE_URL`, restart with `docker compose up -d`

## Troubleshooting

- Run `docker compose ps` to inspect container states.
- Run `docker compose logs -f backend web` to review startup issues.
- Run `docker compose exec backend python manage.py migrate` if the first boot did not run migrations.
- If the backend cannot connect, confirm local Postgres is listening on `localhost:5432` and `DATABASE_URL` uses `host.docker.internal` from Compose.
