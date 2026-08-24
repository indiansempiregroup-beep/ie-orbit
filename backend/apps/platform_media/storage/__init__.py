from apps.platform_media.storage.factory import get_storage_provider
from apps.platform_media.storage.interface import StorageProviderInterface, StoredObject
from apps.platform_media.storage.local import LocalStorageProvider
from apps.platform_media.storage.s3 import S3CompatibleStorageProvider

__all__ = [
    "LocalStorageProvider",
    "S3CompatibleStorageProvider",
    "StorageProviderInterface",
    "StoredObject",
    "get_storage_provider",
]
