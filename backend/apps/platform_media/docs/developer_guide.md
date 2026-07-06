# Platform Media Developer Guide

## Rule

Business and product modules must never directly access the filesystem. Use the media service or
storage provider interface.

## Uploading Media

```python
from apps.platform_media.services import MediaService

result = MediaService().upload(
    uploaded_file=file,
    tenant=request.current_tenant,
    business=business,
    uploaded_by=request.user,
    folder_type="business",
    visibility="private",
    tags=["logo"],
)
```

The upload service handles:

- file validation
- virus scan hook
- checksum calculation
- duplicate detection
- filename normalization
- provider storage
- media record creation

## Multiple Uploads

```python
results = MediaService().upload_multiple(
    files=files,
    tenant=request.current_tenant,
    business=business,
    uploaded_by=request.user,
)
```

## Storage Providers

Providers implement `StorageProviderInterface`:

```python
class StorageProviderInterface:
    def save(self, *, path, file_obj, content_type): ...
    def delete(self, *, path): ...
    def restore(self, *, path): ...
    def public_url(self, *, path): ...
    def private_url(self, *, path): ...
```

The active provider is resolved through `get_storage_provider()`.

## Image Utilities

Reusable utilities are available for:

- thumbnail generation
- resizing
- cropping
- compression
- metadata extraction

Pillow is the image processing backend.

## Security

The media engine validates:

- extension
- MIME type
- maximum upload size
- tags shape

The virus scan service is a hook point. It currently returns clean by default and can be replaced
with ClamAV or a vendor scanner later.

Delete is restricted to tenant owners and platform admins.
