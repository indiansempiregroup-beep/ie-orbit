# M6.5 Architecture Notes

## Purpose

The platform media engine is a reusable foundation service for every IE Platform product. It
centralizes upload validation, storage abstraction, metadata capture, and media access rules.

## Provider Strategy

Storage providers use the Strategy Pattern. The application resolves a provider through
configuration and calls a common interface.

Implemented:

- Local storage

Future providers:

- Amazon S3
- Google Cloud Storage
- Azure Blob Storage
- Cloudinary

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

Signed URLs are reserved for future providers. Local private URLs currently resolve to the local
media URL and should not be treated as production-grade private delivery.
