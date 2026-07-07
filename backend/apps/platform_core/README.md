# Platform Core (Logical Module)

This package documents the **Platform Core** bounded context. It does not replace existing Django apps or move models.

## Purpose

Platform Core owns shared master data consumed by all product applications (AppointIE, InvoiceIE, CRMIE, etc.).

## Current implementation mapping

| Platform Core concern | Django app(s) | Status |
|----------------------|---------------|--------|
| Tenant (internal) | `tenancy` | Implemented |
| Organization | `tenancy` | Implemented |
| Business | `businesses` | Implemented |
| Branch | — | **Future** (not yet modeled) |
| Customer | `customers` | Implemented |
| Staff | `staff` | Implemented |
| Service Catalog | `services` | Implemented |
| Users / IAM | `authentication` | Implemented |
| Media | `platform_media` | Implemented |
| Notifications | `notifications` | Implemented (prefs + delivery) |
| Localization | `businesses`, `tenancy` | Partial (currency, timezone, language on business/tenant) |
| Subscriptions | `tenancy`, `businesses` | Partial (tenant + per-business product subscriptions) |
| Feature Flags | `tenancy.Subscription.feature_flags` | Partial |
| Audit | — | Placeholder (`apps/audit/`) |
| Tags / Custom Fields | `customers`, `services` | Partial (tags on customer/service) |

## Application domains (product-specific)

| Product | Django app(s) | Operational data |
|---------|---------------|------------------|
| AppointIE | `bookings`, `calendar` | Bookings, availability, schedules |
| InvoiceIE | — | Not implemented |
| CRMIE | — | Not implemented |
| InventoryIE | — | Not implemented |
| HRIE | — | Not implemented |

## Registry

See `registry.py` for machine-readable domain mappings used in documentation and future tooling.

## Migration policy

- **Do not** move models between apps without an ADR and phased migration.
- **Do not** break existing API paths or table names.
- New Platform Core entities should extend existing apps or add tables with backward-compatible APIs.
