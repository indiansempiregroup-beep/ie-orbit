# Identity and Access Management

Milestone M4 implements reusable IAM infrastructure for IE Orbit products.

## Scope

Implemented:

- Custom UUID user model with email identity
- JWT access and refresh tokens
- Refresh token rotation and blacklist support
- Logout for current session and all sessions
- Roles and permissions
- Default role seeding
- **OTP sign-in** (email; WhatsApp when workspace/platform sender is live)
- Google sign-in (web, ops-mobile, customer apps)
- Email verification and resend
- OTP challenge infrastructure
- Active session tracking and revocation
- Security audit events
- Profile read/update APIs

Password login, forgot-password, reset-password, and change-password endpoints remain for API compatibility but return **401** or **410** — clients must use OTP.

Not implemented in this module alone:

- Businesses, customers, bookings, etc. (other apps)

## Endpoints

```text
GET   /api/v1/auth/otp/capabilities
POST  /api/v1/auth/otp/send
POST  /api/v1/auth/otp/verify
POST  /api/v1/auth/login              (disabled — use OTP)
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
POST  /api/v1/auth/forgot-password    (410 — use OTP)
POST  /api/v1/auth/reset-password     (410)
POST  /api/v1/auth/change-password    (410)
POST  /api/v1/auth/verify-email
POST  /api/v1/auth/resend-verification
GET   /api/v1/auth/me
PATCH /api/v1/auth/me
```

### Ops WhatsApp OTP sender

Pre-login WhatsApp OTP for **ops-mobile** uses a **platform sender business** chosen in **Platform Admin → Auth** (`PUT /api/v1/platform/auth-settings`). That business must have `notifications_whatsapp`, a live WhatsApp connection, and the `auth_otp` template approved.

Optional env fallback if the database row is empty:

- `OPS_OTP_WHATSAPP_TENANT_SLUG`
- `OPS_OTP_WHATSAPP_BUSINESS_CODE`

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
backend/.venv/bin/python backend/manage.py spectacular --file /tmp/ie-orbit-schema.yml
backend/.venv/bin/ruff check backend
backend/.venv/bin/black --check backend
backend/.venv/bin/pytest backend
```
