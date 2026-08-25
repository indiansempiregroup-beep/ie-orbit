# Database Foundation

This package contains reusable database infrastructure for IE Orbit.

It provides:

- UUID version 7 compatible primary key generation
- Timestamp, audit, tenant, soft-delete, and version mixins
- Abstract `BaseModel`, `TenantModel`, and `AuditModel`
- Active, deleted, all-objects, and soft-delete managers
- Reusable constraints, indexes, validators, and database helpers

No business models are implemented here.
