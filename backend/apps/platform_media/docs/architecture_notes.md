# M6.5 Architecture Notes

## Purpose

The platform media engine is a reusable foundation service for every IE Platform product. It
centralizes upload validation, storage abstraction, metadata capture, and media access rules.

## Provider Strategy

Storage providers use the Strategy Pattern. The application resolves a provider through
configuration and calls a common interface.

Implemented:

- Local storage
- S3-compatible object storage for Cloudflare R2 (`r2` and `s3` factory aliases persist as `s3`)

Future providers:

- Google Cloud Storage
- Azure Blob Storage
- Cloudinary

Production objects stay in a private bucket. The API stores stable `/api/v1/media/{id}/file`
URLs and issues signed GET URLs at read time. Optional `R2_PUBLIC_BASE_URL` may keep absolute
CDN URLs. See IE-0901 in ie-platform-docs.

Product modules depend on `MediaService`, `MediaRepository`, and URL helpers rather than storage
provider details.

## Data Model

`Media` is tenant-owned and may optionally link to a business. It records filename metadata, file
type metadata, checksum, provider, storage path, visibility, tags, folder, and JSON metadata.

`MediaFolder` provides canonical folder grouping for business, staff, customers, services,
documents, temp, and archive.

`StorageProvider` stores provider configuration metadata. Secrets must remain in environment or
secret management systems, not in database JSON.

## Security

The upload path enforces validation before provider writes:

1. extension and MIME checks
2. maximum size check
3. virus scan hook
4. checksum duplicate detection
5. provider storage
6. media record creation

R2/S3 providers generate short-lived signed URLs at read time. Local private URLs still resolve
to the local media path and should not be treated as production-grade private delivery.

Object keys use a single prefix layout (no nested `businesses/{id}` duplication):

```text
tenants/{tenant_id}/businesses/{business_id}/{folder_type}/{uuid}-{filename}
tenants/{tenant_id}/businesses/{business_id}/{folder_type}/{uuid}-{stem}.display.webp
tenants/{tenant_id}/businesses/{business_id}/{folder_type}/{uuid}-{stem}.thumb.webp
backups/postgres/ie_platform_{timestamp}.sql.gz
```

`folder_type` is one of: business, staff, customers, services, documents, temp, archive.
Uploads without a business use `shared` in place of `{business_id}`.
