# Troubleshooting

## Docker compose fails to start

- Ensure Docker Desktop is running and the repository is mounted into the Docker engine.
- Confirm `DATABASE_URL` is set (local default: `postgresql://ie:ie@postgres:5432/ie_platform`).
- Rebuild from scratch with `docker compose down -v && docker compose up --build`.

## Backend cannot connect to database

- Local Docker: use host `postgres` (not `localhost`) in `DATABASE_URL`.
- Neon: use the `postgresql://` scheme and include `sslmode=require`.
- Confirm the `postgres` service is healthy: `docker compose ps postgres`.
- Check the backend logs with `docker compose logs backend`.

## Web app is blank or not hot reloading

- Confirm the Vite container is running and the port 3000 mapping is present.
- Ensure file sharing is enabled for the repository path.

## Mailpit is not receiving mail

- Make sure the backend and Celery containers use `mailpit:1025` as the SMTP host.
- Open the Mailpit UI at http://localhost:8025.
