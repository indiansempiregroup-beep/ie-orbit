# IE Platform

Production source code for the IE Platform by Indians Empire Technologies.

IE Platform is a multi-tenant, API-first, event-driven, white-label SaaS foundation for appointment-based businesses. AppointIE is the first product built on this platform.

## Repository Layout

```text
backend/      Django, DRF, Celery, PostgreSQL, Redis
mobile/       React Native and Expo mobile workspace
web/          React and TypeScript web workspace
shared/       Shared constants, contracts, types, theme resources, and utilities
docker/       Container and orchestration assets
scripts/      Repository automation scripts
.github/      GitHub workflows and repository automation
```

Documentation and design source-of-truth repositories live outside this production repository:

- `../ie-platform-docs`
- `../ie-platform-design`

Do not modify those repositories from product implementation work.

## Backend Quick Start

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example ../.env
python manage.py migrate
python manage.py runserver
```

Health endpoint:

```text
GET /api/v1/health/
GET /api/docs/
GET /api/schema/
```

## Docker quick start

```bash
docker compose up --build
```

This starts the complete local development environment for:

- Django backend
- React/Vite web app
- PostgreSQL
- Redis
- Celery worker
- Celery beat
- Mailpit

## Important notes

- Local PostgreSQL is the default development database; Neon remains optional via `DATABASE_URL`.
- Expo/React Native should be run on the host machine for emulator and device support.
- See [docker/README.md](docker/README.md) for service details.
- See [DEV_DOCKER_GUIDE.md](DEV_DOCKER_GUIDE.md) for onboarding steps.
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.

## Current Repository Status

Milestone M2 implements backend platform core infrastructure only. Product modules and business workflows are intentionally not implemented in this milestone.

Milestone M3 adds backend database foundation only. Business models, authentication models, and product workflows remain intentionally excluded.

Milestone M4 adds backend IAM infrastructure only. Business, booking, customer, service, dashboard, analytics, calendar, and notification domains remain intentionally excluded.
