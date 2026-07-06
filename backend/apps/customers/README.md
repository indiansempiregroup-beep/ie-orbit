# Customer Management

Milestone M7 customer management provides tenant- and business-scoped customer records for appointment-based products.

## Scope

- Customer identity, status, archive, restore, and merge foundation.
- Profile, addresses, notes, tags, preferences, and communication preferences.
- Import and export job foundations.
- Tenant-aware repositories, service-layer validation, and platform response APIs.

## API

- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `GET /api/v1/customers/{id}`
- `PATCH /api/v1/customers/{id}`
- `DELETE /api/v1/customers/{id}`
- `POST /api/v1/customers/{id}/restore`
- `POST /api/v1/customers/{id}/merge`
- `POST /api/v1/customers/bulk/archive`
- `POST /api/v1/customers/import`
- `POST /api/v1/customers/export`
- `GET|POST /api/v1/customers/tags`

All queries require tenant context and return platform response envelopes.
