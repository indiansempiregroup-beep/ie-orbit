# Backend Development Guide

## Configuration

The backend uses `python-dotenv` and typed environment parsing in `config/env.py`.

Settings modules:

- `config.settings.development`
- `config.settings.staging`
- `config.settings.production`

Required environment variables:

- `DJANGO_SECRET_KEY`
- `DATABASE_URL`
- `REDIS_URL`

## Infrastructure

PostgreSQL is the transactional database. Host Postgres is the default in development. Neon connection strings are also supported through `DATABASE_URL`.

Redis powers:

- Django cache
- Celery broker
- Celery result backend

Celery auto-discovers tasks from installed Django apps. No product tasks are implemented in M2.

## API Standards

All API responses use a predictable envelope:

```json
{
  "data": {},
  "meta": {
    "request_id": "optional",
    "timestamp": "2026-07-04T00:00:00+00:00"
  }
}
```

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more request fields are invalid.",
    "details": {}
  }
}
```

## Logging

Logs are JSON-formatted and written to:

- Console
- `backend/logs/application.log`
- `backend/logs/error.log`

Request logs include request ID, method, path, status code, and duration.

## IAM

IAM endpoints live under `/api/v1/auth/`.

Use service classes under `apps.authentication.services` for authentication, password, email verification, OTP, roles, and security audit behavior. Views should validate request payloads and delegate business rules to services.
