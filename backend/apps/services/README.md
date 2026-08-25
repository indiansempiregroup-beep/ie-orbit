# Service Catalog

Milestone M7 service catalog provides reusable service definitions for appointment-based IE Orbit products.

## Scope

- Service categories, services, variants, duration, pricing, tax configuration, images, tags, visibility, and status.
- Gender and age restrictions.
- Online booking availability flag only; booking logic remains outside this module.
- Future add-ons and package metadata foundations.

## API

- `GET /api/v1/service-categories`
- `POST /api/v1/service-categories`
- `PATCH /api/v1/service-categories/{id}`
- `DELETE /api/v1/service-categories/{id}`
- `GET /api/v1/services`
- `POST /api/v1/services`
- `GET /api/v1/services/{id}`
- `PATCH /api/v1/services/{id}`
- `DELETE /api/v1/services/{id}`
- `GET|POST /api/v1/services/tags`

Service media uses `platform_media.Media`; business modules must not access the filesystem directly.
