# Identity and Access Management

Milestone M4 implements reusable IAM infrastructure for IE Platform products.

## Scope

Implemented:

- Custom UUID user model with email login
- JWT access and refresh tokens
- Refresh token rotation and blacklist support
- Logout for current session and all sessions
- Roles and permissions
- Default role seeding
- Password reset and password change
- Email verification and resend
- OTP challenge infrastructure with mock provider
- Active session tracking and revocation
- Failed login tracking and account lockout
- IP address and user-agent logging
- Security audit events
- Profile read/update APIs

Not implemented:

- Businesses
- Customers
- Services
- Bookings
- Calendar
- Notifications
- Analytics
- Business dashboards

## Endpoints

```text
POST  /api/v1/auth/login
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
POST  /api/v1/auth/forgot-password
POST  /api/v1/auth/reset-password
POST  /api/v1/auth/change-password
POST  /api/v1/auth/verify-email
POST  /api/v1/auth/resend-verification
GET   /api/v1/auth/me
PATCH /api/v1/auth/me
```

## Default Roles

- `super_admin`
- `platform_admin`
- `business_owner`
- `manager`
- `staff`
- `customer`

## Platform admin access

Django `createsuperuser` sets `is_superuser=True` but does **not** assign a platform role by itself.

The web and ops-mobile **Platform Admin** UI is gated on the `platform_admin` or `super_admin` **role code** in `/auth/me` (and the login payload).

On login and `GET /auth/me`, the API automatically assigns `platform_admin` to any Django superuser that is missing that role, so local superusers get the Platform Admin menu and land on `/admin` (web) without a manual IAM step.

Tenant workspaces (for example a white-label business such as Rupali’s) may still appear in the workspace picker because superusers can see all tenants for support — that does not mean the superuser owns that business.

## Local Validation

```bash
backend/.venv/bin/python backend/manage.py check
backend/.venv/bin/python backend/manage.py migrate
backend/.venv/bin/python backend/manage.py spectacular --file /tmp/ie-platform-schema.yml
backend/.venv/bin/ruff check backend
backend/.venv/bin/black --check backend
backend/.venv/bin/pytest backend
```

## Password Policy

Passwords must satisfy Django password validators and the platform password policy:

- At least 10 characters
- At least one uppercase character
- At least one lowercase character
- At least one digit

Password history is stored for future reuse prevention.

## OTP

OTP infrastructure supports generation, hashed storage, expiry, retry limits, validation, and provider abstraction. No SMS provider integration is included in this milestone.
