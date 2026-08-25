# IE Orbit Ops Mobile

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

Platform Admin (`platform_admin` / `super_admin`) uses the Expo ops app (Tenants / Coupons / Audit). Remaining admin pages (subscriptions, packages, tickets, branding) stay on the Vite console at `:3000` / `app.ie-orbit.com`.

## Run locally

Env vars come from the **repo-root** `.env` (same file as Docker/backend/web). Copy from `.env.example` at the monorepo root if needed — do not create `apps/ops-mobile/.env`.

Browser (same app as iOS/Android):

```bash
cd apps/ops-mobile
corepack pnpm web
```

Open **http://localhost:8082**. Sign in with a **business owner** or **invited staff** account.

Phone / emulator:

```bash
cd apps/ops-mobile
corepack pnpm start -- --clear
```

Shell overrides still work when you need a device-reachable API host, e.g. `EXPO_PUBLIC_API_BASE_URL=http://172.x.x.x:8000/api/v1`.

## Production web

The ops workspace is also a static Expo web build at **https://ops.ie-orbit.com**. Sign in from https://ie-orbit.com; owners and staff land here. Platform admins are sent to https://app.ie-orbit.com.

`cd apps/ops-mobile && corepack pnpm export:web` writes `dist/` for that build; production nginx builds it inside `docker/nginx/Dockerfile`.

## App identity

- iOS/Android: `com.ieorbit.ops`
- Branding: **IE Orbit** (not white-label)
