# Staff Management

Milestone M7 staff management provides the operational staff domain for AppointIE and future appointment-based products.

## Scope

- Staff identity, profile, employment details, business roles, certifications, documents, notes, and photo.
- Staff skills as a tenant- and business-scoped relationship between staff and services.
- Staff service assignments with duration override, price override, and priority.
- Standard business role seed data: owner, manager, receptionist, stylist, therapist, technician, consultant, assistant, and read-only.

## API

- `GET /api/v1/staff`
- `POST /api/v1/staff`
- `GET /api/v1/staff/{id}`
- `PATCH /api/v1/staff/{id}`
- `DELETE /api/v1/staff/{id}`
- `GET|POST /api/v1/staff/skills`
- `GET|POST /api/v1/staff/assignments`

Staff files and photos integrate through the Platform Media Engine.
