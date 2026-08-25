# Businesses

Milestone M6 implements Business Domain Management for the IE Orbit.

## Scope

This app owns:

- Business core profile
- Business profile content
- Business settings
- Business media references
- Business verification status foundation
- Tenant-scoped business search
- Business REST APIs
- Django Admin registrations

It intentionally does not implement customers, staff, services, bookings, availability,
notifications, analytics, or payment processing.

## Models

- `Business`
- `BusinessProfile`
- `BusinessSettings`
- `BusinessMedia`

All models inherit from `TenantModel`, which preserves tenant ownership, UUID primary keys,
timestamps, audit metadata, versioning, and soft deletion.

## API

Endpoints are available under `/api/v1/`:

- `POST /businesses`
- `GET /businesses`
- `GET /businesses/{id}`
- `PATCH /businesses/{id}`
- `DELETE /businesses/{id}`
- `GET /businesses/me`
- `PATCH /businesses/me`

Swagger is available at `/api/docs/`.

## Search

`GET /api/v1/businesses` supports:

- `q`
- `category`
- `city`
- `country`
- `status`
- `tags`

All searches are scoped to the resolved tenant context.
