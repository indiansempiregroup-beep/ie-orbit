# Architecture Notes

## Development environment

The Docker platform is designed to provide a complete local environment without requiring a manual Redis, Celery, or backend bootstrap step.

## Runtime model

- The backend runs Django with a development server and mounts the repository for hot reload.
- The web app runs Vite in development mode with host binding for Docker access.
- Redis provides cache and Celery broker state with a persistent volume.
- Celery worker and beat run as separate services using the same Django environment.
- Mailpit captures outbound mail locally for development testing.

## Database strategy

Local PostgreSQL (`postgres:18-alpine` in Docker Compose) is the default development database. Set `DATABASE_URL` to a Neon pooler URL only when you intentionally want a remote shared database.
