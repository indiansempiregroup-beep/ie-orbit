# Tenancy

Milestone M5 implements the IE Orbit tenant and organization foundation.

## Scope

This app owns:

- Tenant lifecycle
- Organization profile
- Request tenant resolution
- Request tenant context
- Tenant-scoped query infrastructure
- Branding foundation
- Subscription foundation
- Tenant and organization settings
- Django Admin registrations
- REST API endpoints under `/api/v1/`

It intentionally does not implement bookings, customers, services, staff, notifications,
analytics, calendar, availability, or scheduling logic.

## Core Models

- `Tenant`
- `Organization`
- `Branding`
- `SubscriptionPlan`
- `Subscription`
- `TenantSettings`
- `OrganizationSettings`

All persistent models inherit from `BaseModel` or `TenantModel`, preserving UUID primary keys,
timestamps, audit metadata, versioning, and soft delete behavior.

## API

Tenant endpoints:

- `POST /api/v1/tenants`
- `GET /api/v1/tenants`
- `GET /api/v1/tenants/{id}`
- `PATCH /api/v1/tenants/{id}`
- `DELETE /api/v1/tenants/{id}`

Current tenant endpoints:

- `GET /api/v1/organizations/me`
- `PATCH /api/v1/organizations/me`
- `GET /api/v1/tenant/settings`
- `PATCH /api/v1/tenant/settings`

Swagger is available at `/api/docs/`.

## Tenant Resolution

Resolution order:

1. `X-Tenant-ID`
2. `X-Tenant-Slug`
3. Custom domain from tenant brand settings
4. Subdomain slug
5. Authenticated tenant owner fallback

Middleware attaches `request.current_tenant`, `request.current_organization`, and
`request.current_user`.
