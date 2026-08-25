# Backend

Django backend workspace for IE Orbit.

## Milestone Scope

Implemented platform core infrastructure through M8:

- Split settings: `config/settings/base.py`, `development.py`, `staging.py`, `production.py`
- Typed `.env` loading with fail-fast validation
- PostgreSQL configuration compatible with Neon connection URLs
- Redis cache configuration
- Celery broker/result configuration with beat scheduler support
- Structured console/file/error logging
- Request logging middleware
- Standard API success/error/validation/pagination envelopes
- Global DRF exception handler
- Health endpoint at `/api/v1/health/`
- OpenAPI schema at `/api/schema/`
- Swagger UI at `/api/docs/`
- Base utilities for UUID, dates, validators, pagination, and permissions
- Database foundation with abstract models, mixins, managers, soft delete, UUID v7 helpers, tenant model base classes, and reusable database utilities
- IAM foundation with custom users, JWT, roles, permissions, sessions, password reset, email verification, OTP infrastructure, and security audit events
- Tenant and organization foundation with tenant resolution, tenant context, tenant-scoped query helpers, branding, subscription readiness, organization settings, Django Admin, and documented REST APIs
- Business domain management with tenant-owned businesses, profiles, settings, media references, verification status foundation, tenant-scoped search, Django Admin, and documented REST APIs
- Platform media management with provider-agnostic storage interface, local storage provider, upload validation, duplicate detection, image utilities, folder management, Django Admin, and documented REST APIs
- Scheduling and booking engine with business schedules, staff availability, slot generation, conflict detection, booking workflow, event-ready state records, Django Admin, and documented REST APIs

Notifications, Google Calendar sync, analytics, payment processing, invoices, loyalty, and marketing
remain out of scope until their approved milestones.

## Local Setup

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example ../.env
```

Update `../.env` with local PostgreSQL and Redis connection details.

## Run

```bash
python manage.py migrate
python manage.py runserver
```

Celery worker:

```bash
celery -A config.celery worker --loglevel=INFO
```

Celery beat:

```bash
celery -A config.celery beat --loglevel=INFO
```

## Verify

```bash
python manage.py check
python manage.py spectacular --file schema.yml
curl http://127.0.0.1:8000/api/v1/health/
```

Open Swagger:

```text
http://127.0.0.1:8000/api/docs/
```

## Quality

```bash
ruff check .
black --check .
pytest
```

## Database Foundation

Read [DATABASE.md](DATABASE.md) and [docs/model_creation_guide.md](docs/model_creation_guide.md) before creating any model.

## Identity and Access Management

Read [AUTHENTICATION.md](AUTHENTICATION.md) before extending authentication or authorization behavior.

## Tenant and Organization Platform

Milestone M5 exposes:

- `POST /api/v1/tenants`
- `GET /api/v1/tenants`
- `GET /api/v1/tenants/{id}`
- `PATCH /api/v1/tenants/{id}`
- `DELETE /api/v1/tenants/{id}`
- `GET /api/v1/organizations/me`
- `PATCH /api/v1/organizations/me`
- `GET /api/v1/tenant/settings`
- `PATCH /api/v1/tenant/settings`

Tenant resolution supports `X-Tenant-ID`, legacy `X-Tenant-Slug`, future custom domains,
future subdomains, and authenticated-owner fallback.

Read [apps/tenancy/README.md](apps/tenancy/README.md) and
[apps/tenancy/docs/developer_guide.md](apps/tenancy/docs/developer_guide.md) before adding tenant-owned models.

## Business Domain Management

Milestone M6 exposes:

- `POST /api/v1/businesses`
- `GET /api/v1/businesses`
- `GET /api/v1/businesses/{id}`
- `PATCH /api/v1/businesses/{id}`
- `DELETE /api/v1/businesses/{id}`
- `GET /api/v1/businesses/me`
- `PATCH /api/v1/businesses/me`

Business search supports `q`, `category`, `city`, `country`, `status`, and `tags`.

Read [apps/businesses/README.md](apps/businesses/README.md) and
[apps/businesses/docs/developer_guide.md](apps/businesses/docs/developer_guide.md) before adding
business-owned product features.

## Platform Media Management

Milestone M6.5 exposes:

- `POST /api/v1/media/upload`
- `POST /api/v1/media/upload-multiple`
- `GET /api/v1/media`
- `GET /api/v1/media/{id}`
- `PATCH /api/v1/media/{id}`
- `DELETE /api/v1/media/{id}`

Storage is provider agnostic. Local storage is implemented; S3, Google Cloud Storage, Azure Blob
Storage, and Cloudinary are pluggable future providers.

Read [apps/platform_media/README.md](apps/platform_media/README.md),
[apps/platform_media/docs/developer_guide.md](apps/platform_media/docs/developer_guide.md), and
[apps/platform_media/docs/architecture_notes.md](apps/platform_media/docs/architecture_notes.md)
before adding media usage to product modules.

## Scheduling and Booking Engine

Milestone M8 exposes:

- `POST /api/v1/bookings`
- `GET /api/v1/bookings`
- `GET /api/v1/bookings/{id}`
- `PATCH /api/v1/bookings/{id}`
- `DELETE /api/v1/bookings/{id}`
- `POST /api/v1/bookings/{id}/confirm`
- `POST /api/v1/bookings/{id}/cancel`
- `POST /api/v1/bookings/{id}/reschedule`
- `POST /api/v1/bookings/{id}/check-in`
- `POST /api/v1/bookings/{id}/complete`
- `GET /api/v1/availability`
- `GET /api/v1/availability/staff`
- `GET /api/v1/availability/business`

Read [apps/bookings/README.md](apps/bookings/README.md),
[apps/bookings/docs/developer_guide.md](apps/bookings/docs/developer_guide.md), and
[apps/bookings/docs/architecture_notes.md](apps/bookings/docs/architecture_notes.md) before extending
booking behavior.
