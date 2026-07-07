# Compatibility Report — Platform Architecture Evolution

**Date:** 2026-07-07

## API Compatibility

| Area | Status | Notes |
|------|--------|-------|
| REST endpoints | ✅ Preserved | No path or method changes |
| Request/response schemas | ✅ Preserved | SDK types unchanged except additive `WorkspaceSnapshot` |
| `X-Tenant-ID` header | ✅ Preserved | Still required for tenant-scoped APIs |
| Auth flows | ✅ Preserved | Login, register, refresh unchanged |
| Business product subscriptions | ✅ Preserved | POST/DELETE/PATCH product-subscriptions |
| Bookings UUID references | ✅ Preserved | Loose coupling maintained |

## Database Compatibility

| Area | Status | Notes |
|------|--------|-------|
| Existing migrations | ✅ Untouched | No new migrations in this milestone |
| Table names | ✅ Preserved | All 18 migration files valid |
| TenantModel inheritance | ✅ Preserved | `core.db.models.TenantModel` |
| Cross-app UUID refs on Booking | ✅ Preserved | Intentional design |

## Frontend Compatibility

| Area | Status | Notes |
|------|--------|-------|
| Routes | ✅ Preserved | All existing routes work; `/reports` now renders |
| `WorkspaceContext` API | ✅ Preserved | Same exposed methods |
| localStorage keys | ✅ Preserved | `ie:active-tenant-id`, `ie:active-business-id` |
| Auth context | ✅ Preserved | Unchanged |
| Settings URLs | ✅ Preserved | `/settings/business` still works |

## SDK Compatibility

| Area | Status | Notes |
|------|--------|-------|
| `createApiClient()` | ✅ Preserved | |
| Domain types | ✅ Preserved | Business, Customer, Staff, Service, Booking |
| Additive types | ✅ New | `WorkspaceSnapshot` only |

## UI Copy Changes (Non-Breaking)

| Before | After |
|--------|-------|
| Sidebar: "AppointIE / Platform shell" | `{Product} · {Business}` |
| Header subtitle: business name only | `AppointIE · Empire Salon` |
| Settings tab: "Business" | "Business Profile" |
| Workspace switcher order | Product first, then Business |

These are presentation-only. No behavioral API contract change.

## Known Incompatibilities (Pre-Existing, Not Introduced)

| Issue | Impact |
|-------|--------|
| `managementHooks` not workspace-scoped | Data may not filter by active business |
| Missing `ReportsPage` | Was broken; now placeholder |
| `notificationsHooks` without tenant scope | May return wrong tenant data in edge cases |

## Verdict

**Fully backward compatible** for API, database, and SDK consumers. UI labeling evolved per ADR-002 without breaking integrations.
