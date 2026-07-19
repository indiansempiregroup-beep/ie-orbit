# Docker Developer Guide

## One-command start

```bash
docker compose up --build
```

## Default services

- Backend: http://localhost:8000
- API docs: http://localhost:8000/api/docs/
- Health: http://localhost:8000/api/health/
- Web app: http://localhost:3000
- Mailpit UI: http://localhost:8025
- Postgres: localhost:5432 (`ie` / `ie` / `ie_platform`)

## Notes

- Local PostgreSQL (`postgres:18-alpine`) is the default development database.
- Backend startup runs migrations and the pilot seed automatically.
- Keep a Neon URL in `DATABASE_URL` only when you intentionally want a remote DB.
- The compose stack uses Redis for cache and Celery broker state.
- The backend uses mounted source code for live reload in development.
- The web app uses Vite with host binding for Docker compatibility.

## Switch database

- Local (default): `DATABASE_URL=postgresql://ie:ie@postgres:5432/ie_platform`
- Neon: paste your Neon pooler URL into `.env` as `DATABASE_URL`
- After changing `DATABASE_URL`, restart with `docker compose up -d`

## Troubleshooting

- Run `docker compose ps` to inspect container states.
- Run `docker compose logs -f backend web postgres` to review startup issues.
- Run `docker compose exec backend python manage.py migrate` if the first boot did not run migrations.
- If the backend cannot connect, confirm `DATABASE_URL` uses host `postgres` inside Docker (not `localhost`).
