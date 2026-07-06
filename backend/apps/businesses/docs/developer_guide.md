# Business Domain Developer Guide

## Domain Boundary

The business domain represents operational entities that provide services to customers. A tenant can
own one or more businesses. A business belongs to one tenant and one organization.

Do not add customer, staff, service, booking, availability, notification, analytics, or payment
logic to this app.

## Creating Businesses

Use `BusinessService` for mutations:

```python
from apps.businesses.services import BusinessService

business = BusinessService().create_business(
    data=payload,
    tenant=request.current_tenant,
    organization=request.current_organization,
    actor=request.user,
)
```

The service automatically creates:

- `BusinessProfile`
- `BusinessSettings`

## Querying Businesses

Use `BusinessRepository` or the tenant-aware manager:

```python
from apps.businesses.repositories import BusinessRepository

businesses = BusinessRepository().list_for_request(
    tenant=request.current_tenant,
    user=request.user,
)
```

For model-level querying:

```python
Business.objects.require_tenant(request.current_tenant)
```

Never query tenant-owned business records without tenant scope.

## Search

Use `BusinessSearchService` for reusable business search:

```python
from apps.businesses.services import BusinessSearchService

results = BusinessSearchService().search(
    tenant=request.current_tenant,
    user=request.user,
    params=request.query_params,
)
```

Supported filters:

- `q`
- `category`
- `city`
- `country`
- `status`
- `tags`

## Permissions

Write operations are allowed for:

- Platform admins
- Tenant owners
- Users with `business:write`, `business:update`, or `business:manage`

Read operations still require authentication and a resolved tenant context.

## Media

`BusinessMedia` stores URL-based media references today:

- logo
- banner
- gallery image
- document
- certificate

The `storage_backend` and `metadata` fields are reserved for future storage abstraction.
