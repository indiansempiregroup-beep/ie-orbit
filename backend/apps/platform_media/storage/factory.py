from __future__ import annotations

from django.conf import settings

from apps.platform_media.storage.interface import StorageProviderInterface
from apps.platform_media.storage.local import LocalStorageProvider


def get_storage_provider(provider_code: str | None = None) -> StorageProviderInterface:
    code = provider_code or getattr(settings, "PLATFORM_MEDIA_STORAGE_PROVIDER", "local")
    if code == "local":
        return LocalStorageProvider()
    raise NotImplementedError(f"Storage provider '{code}' is not configured.")
