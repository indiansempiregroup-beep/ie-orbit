# Customer Management Architecture Notes

The customer module is scoped by tenant and business. Every model inherits from `TenantModel`, and repositories start from `objects.require_tenant(...)`.

The service layer owns duplicate detection, archive/restore, profile and preference foundation creation, import/export job creation, and merge records. Import/export are foundations only; no background ingestion engine is introduced in M7.

Customer media references `platform_media.Media` for photos and import/export files. The module does not directly access storage providers or the filesystem.
