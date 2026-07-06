# Tenant Platform Developer Guide

## Adding Tenant-Owned Models

Use `TenantModel` for every model that belongs to a tenant:

```python
from django.db import models

from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class ExampleRecord(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    name = models.CharField(max_length=120)

    class Meta(TenantModel.Meta):
        db_table = "example_records"
```

Always scope tenant-owned queries:

```python
ExampleRecord.objects.require_tenant(request.current_tenant)
ExampleRecord.objects.for_tenant(tenant_id)
```

Use `require_tenant()` when a missing tenant is a programming error. It raises `ValueError`
instead of returning cross-tenant data.

## Request Context

`TenantResolutionMiddleware` attaches:

- `request.current_tenant`
- `request.current_organization`
- `request.current_user`
- `request.tenant_resolution_source`

Reusable helpers are also available:

```python
from apps.tenancy.services.context import current_tenant, current_organization, current_user
```

## Tenant Resolution

Resolution currently supports:

- `X-Tenant-ID`
- `X-Tenant-Slug`
- future custom domains via `Tenant.brand_settings["custom_domains"]`
- future subdomain slugs
- authenticated-owner fallback

Product APIs should require tenant context before executing tenant-owned business logic.

## Repository and Service Layer

Use `TenantRepository` for tenant visibility, foundation record access, and default settings.
Use `TenantService` for tenant lifecycle mutations.

View code should remain thin:

- validate request data in serializers
- call service methods for mutations
- use repositories for tenant-scoped reads
- return standard API envelopes

## Out-of-Scope Modules

Do not add booking, customer, service, staff, notification, analytics, calendar, availability, or
scheduling behavior to this app. Those domains must wait for their approved milestones.
