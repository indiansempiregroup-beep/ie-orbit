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

Neon PostgreSQL is the default development database target. The environment variables are intentionally configured to point at a remote Neon URL, while remaining compatible with a future local PostgreSQL override through configuration only.
