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

## Notes

- Neon PostgreSQL is the default database target; do not use a local PostgreSQL container.
- The compose stack uses Redis for cache and Celery broker state.
- The backend uses mounted source code for live reload in development.
- The web app uses Vite with host binding for Docker compatibility.

## Troubleshooting

- Run `docker compose ps` to inspect container states.
- Run `docker compose logs -f backend web` to review startup issues.
- Run `docker compose exec backend python manage.py migrate` if the first boot did not run migrations.
