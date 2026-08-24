from __future__ import annotations

from django.conf import settings

from apps.platform_media.storage.interface import StorageProviderInterface
from apps.platform_media.storage.local import LocalStorageProvider
from apps.platform_media.storage.s3 import S3CompatibleStorageProvider


def get_storage_provider(provider_code: str | None = None) -> StorageProviderInterface:
    code = (
        provider_code or getattr(settings, "PLATFORM_MEDIA_STORAGE_PROVIDER", "local")
    ).strip().lower()
    if code == "local":
        return LocalStorageProvider()
    if code in {"s3", "r2"}:
        # Persist as s3 so existing StorageProviderType choices remain valid.
        return S3CompatibleStorageProvider(provider_code="s3")
    raise NotImplementedError(f"Storage provider '{code}' is not configured.")
