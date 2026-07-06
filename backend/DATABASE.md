# Database Foundation Standards

## Scope

Milestone M3 establishes reusable database infrastructure only. It does not create product, authentication, booking, customer, business, staff, service, notification, analytics, calendar, or workflow models.

## Approved Base Entity

Every persistent domain model should inherit from `BaseModel` or `TenantModel`.

`BaseModel` provides:

- `id`: UUID primary key generated with a UUID v7 compatible strategy
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `deleted_at`
- `deleted_by`
- `is_active`
- `version`
- soft-delete and restore behavior
- active, deleted, and all-object managers

`TenantModel` adds:

- `tenant_id`
- tenant validation
- tenant-aware indexes

## Managers

Use the provided managers consistently:

- `objects`: active, non-deleted rows
- `active_objects`: active, non-deleted rows
- `deleted_objects`: soft-deleted rows
- `all_objects`: all rows

## Soft Delete

Call `soft_delete()` for normal deletion and `restore()` to restore records.

Permanent deletion is intentionally explicit:

```python
instance.permanent_delete()
```

Querysets also support:

```python
Model.objects.filter(...).soft_delete(deleted_by=actor_id)
Model.all_objects.deleted().restore(restored_by=actor_id)
Model.all_objects.filter(...).permanent_delete()
```

## Audit Readiness

Audit metadata is represented as UUID values so the foundation does not depend on a concrete user/authentication implementation.

Use:

- `mark_created(actor_id=...)`
- `mark_updated(actor_id=...)`
- `mark_deleted(actor_id=...)`
- `mark_restored(actor_id=...)`

These methods return an audit event object that future audit infrastructure can persist or publish.

## Tenant Isolation

Tenant-owned models must inherit from `TenantModel`.

Every tenant-owned query must scope by `tenant_id` before applying business logic.

## Migration Strategy

- Use Django migrations for every concrete database schema change.
- Abstract model changes affect concrete subclasses and must be followed by migration generation.
- Migrations must be backward-compatible whenever possible.
- Avoid destructive migrations unless explicitly approved.
- Never add product tables during foundation milestones.

## Indexing Strategy

Default abstract indexes cover:

- active/deleted lookups
- creation timestamps
- update timestamps
- tenant + active/deleted lookups
- tenant + creation timestamp lookups

Add extra indexes only when a concrete access pattern justifies them.
