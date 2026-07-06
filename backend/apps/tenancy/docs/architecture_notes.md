# M5 Architecture Notes

## Purpose

The tenancy app is the multi-tenant foundation for current and future IE products. AppointIE,
InvoiceIE, InventoryIE, CRMIE, and future products should depend on this layer for tenant identity,
organization metadata, branding, subscription readiness, and request context.

## Domain Boundaries

`Tenant` represents the customer/account boundary.

`Organization` represents the business profile attached to the tenant.

`Branding` stores white-label and theme foundations.

`SubscriptionPlan` and `Subscription` provide subscription-ready structure without payment gateway
integration.

`TenantSettings` and `OrganizationSettings` store operational configuration such as business hours,
booking preferences, localization, notification defaults, and security preferences. These settings
are configuration records only; no booking workflow is implemented in M5.

## Data Isolation

Tenant-owned models inherit from `TenantModel` and use `TenantAwareManager` where tenant-scoped
helpers are needed. APIs must use the resolved tenant context before reading or mutating
tenant-owned data.

The active queryset managers preserve the platform soft-delete rules:

- `objects` returns active records
- `deleted_objects` returns soft-deleted records
- `all_objects` returns all records

## Request Lifecycle

1. Authentication middleware attaches `request.user`.
2. `TenantResolutionMiddleware` resolves tenant identity.
3. The middleware attaches current tenant, organization, user, and resolution source.
4. API permissions require authentication and tenant context where needed.
5. Repositories and managers scope tenant-owned reads.

## API Documentation

All M5 endpoints are documented through `drf-spectacular` annotations and are included in
`/api/schema/` and `/api/docs/`.
