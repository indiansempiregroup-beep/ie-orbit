# IE Platform Ops Mobile

Operations app for business owners, managers, and staff. Separate from the white-label **customer** app in `/mobile`.

## Feature parity with web ops portal

| Area | Capabilities |
|------|----------------|
| **Auth** | Login, forgot/reset password, accept invitation, customer-account gate |
| **Dashboard** | KPIs, upcoming bookings, quick actions, global search, FAB for new booking |
| **Bookings** | List, search, create, detail, confirm, check-in, complete, cancel, reschedule |
| **Calendar** | Day picker, availability slots, book from slot, day bookings |
| **Customers** | List, search, create, edit, detail, archive/restore |
| **Services** | List, search, create, edit, detail, book from service |
| **Staff** | List, search, create, edit, detail, weekly schedule view |
| **Alerts** | List, tap to mark read, mark all read, realtime SSE |
| **BI** | Overview, revenue, forecast, reports (30-day window) |
| **Reports** | Operational summary + link to BI |
| **Settings** | Business profile, edit business, products/billing, team |
| **Team** | Invite staff/manager, list members, revoke pending invites |
| **Profile** | View, edit, change password, sessions, verify email |
| **Workspace** | Multi-tenant / multi-business picker and switcher |

Platform Admin (`platform_admin` / `super_admin`) is **web-only** — use the web Platform Admin console. Ops mobile is for business owners, managers, and staff.

## Run locally

Env vars come from the **repo-root** `.env` (same file as Docker/backend/web). Copy from `.env.example` at the monorepo root if needed — do not create `apps/ops-mobile/.env`.

```bash
cd apps/ops-mobile
corepack pnpm start -- --clear
```

Shell overrides still work when you need a device-reachable API host, e.g. `EXPO_PUBLIC_API_BASE_URL=http://172.x.x.x:8000/api/v1`.

Sign in with a **business owner** or **invited staff** account.

## App identity

- iOS/Android: `com.ieplatform.ops`
- Branding: **IE Platform** (not white-label)
