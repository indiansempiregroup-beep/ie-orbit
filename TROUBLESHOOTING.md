# Troubleshooting

## Docker compose fails to start

- Ensure Docker Desktop is running and the repository is mounted into the Docker engine.
- Confirm you have a valid DATABASE_URL for Neon PostgreSQL.
- Rebuild from scratch with `docker compose down -v && docker compose up --build`.

## Backend cannot connect to database

- Verify DATABASE_URL uses the `postgresql://` scheme and includes `sslmode=require` for Neon.
- Check the backend logs with `docker compose logs backend`.

## Web app is blank or not hot reloading

- Confirm the Vite container is running and the port 3000 mapping is present.
- Ensure file sharing is enabled for the repository path.

## Mailpit is not receiving mail

- Make sure the backend and Celery containers use `mailpit:1025` as the SMTP host.
- Open the Mailpit UI at http://localhost:8025.
