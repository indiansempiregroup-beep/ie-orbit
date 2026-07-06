# Model Creation Guide

## Choose the Base Class

Use `BaseModel` for platform-level records that are not owned by a tenant.

Use `TenantModel` for tenant-owned records.

## Required Pattern

```python
from apps.core.models import TenantModel


class ExampleRecord(TenantModel):
    name = models.CharField(max_length=120)

    class Meta:
        db_table = "example_records"
```

This example is documentation only. Do not add concrete product models until the relevant milestone is approved.

## Soft Delete

Use soft delete for normal application deletion:

```python
record.soft_delete(deleted_by=actor_id)
```

Use permanent delete only for approved operational cleanup:

```python
record.permanent_delete()
```

## Querying

```python
ExampleRecord.objects.filter(tenant_id=tenant_id)
ExampleRecord.deleted_objects.filter(tenant_id=tenant_id)
ExampleRecord.all_objects.filter(tenant_id=tenant_id)
```

## Audit

```python
record.mark_updated(actor_id=actor_id)
record.save(update_fields=["name", "updated_by"])
```

## Constraints

Use reusable helpers from `apps.core.db.constraints` where they fit:

```python
from apps.core.db.constraints import active_unique_constraint
```

## Indexes

Use reusable helpers from `apps.core.db.indexes` for common access patterns:

```python
from apps.core.db.indexes import tenant_lookup_index
```
