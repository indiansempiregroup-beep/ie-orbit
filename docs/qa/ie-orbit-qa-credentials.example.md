# IE Orbit QA credentials (example)

Copy this file to `~/Sanket/IMP/ie-orbit-qa-credentials.md` and fill real UAT accounts.
Never commit the filled copy. Never use production tenants for mutating Playwright CRUD.

## UAT hosts

- Marketing: `https://uat.ie-orbit.com`
- Platform Admin: `https://app-uat.ie-orbit.com`
- Ops web: `https://ops-uat.ie-orbit.com`
- API: `https://api-uat.ie-orbit.com/api/v1`

## Dedicated tenant

Seed once on the UAT VPS (not production):

```bash
docker compose -f docker-compose.uat.yml exec backend \
  python manage.py seed_e2e_qa_tenant \
    --owner-email qa-owner@example.com \
    --staff-email qa-staff@example.com \
    --admin-email qa-admin@example.com \
    --customer-email qa-customer@example.com
```

Also add those emails to UAT `AUTH_OTP_DEBUG_EMAILS` so Playwright can read OTP `debug_code` without `DJANGO_DEBUG=true`.

## Accounts

| Role | Email | Notes |
|------|-------|-------|
| Tenant owner | | OTP-only. Put in `QA_OWNER_EMAIL`. |
| Staff | | Optional. Same tenant as owner. |
| Platform admin | | OTP-only. Put in `QA_PLATFORM_ADMIN_EMAIL`. Must **not** also have `business_owner` / `staff`. |
| Customer | | Maestro / customer APK. Put in `QA_CUSTOMER_EMAIL`. |

Passwords are unused for ops/admin Playwright (OTP). Keep any Maestro passwords here if needed.

## Playwright `e2e/.env`

```
QA_BASE_URL=https://uat.ie-orbit.com
QA_OPS_URL=https://ops-uat.ie-orbit.com
QA_ADMIN_URL=https://app-uat.ie-orbit.com
QA_API_URL=https://api-uat.ie-orbit.com/api/v1
QA_OWNER_EMAIL=
QA_STAFF_EMAIL=
QA_PLATFORM_ADMIN_EMAIL=
QA_CUSTOMER_EMAIL=
```
