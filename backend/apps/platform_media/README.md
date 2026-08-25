# Platform Media

Milestone M6.5 implements the reusable IE Orbit media engine.

## Scope

This app owns:

- Media records
- Media folders
- Storage provider configuration
- Storage provider interface
- Local storage provider
- Upload services
- Media validation and security hooks
- Image utility functions
- Media REST APIs
- Django Admin registrations

It intentionally does not implement bookings, customers, services, staff, notifications, analytics,
calendar, business workflows, or payment processing.

## API

Endpoints are available under `/api/v1/`:

- `POST /media/upload`
- `POST /media/upload-multiple`
- `GET /media`
- `GET /media/{id}`
- `PATCH /media/{id}`
- `DELETE /media/{id}`

Swagger is available at `/api/docs/`.

## Storage

Storage is provider agnostic. Product modules must not read or write files directly.

Implemented provider:

- Local storage

Pluggable provider types:

- Amazon S3
- Google Cloud Storage
- Azure Blob Storage
- Cloudinary

Switching providers should be done through configuration and provider implementation, not business
module changes.
