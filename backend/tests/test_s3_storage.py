from __future__ import annotations

from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings

from apps.platform_media.storage.factory import get_storage_provider
from apps.platform_media.storage.s3 import S3CompatibleStorageProvider

R2_SETTINGS = {
    "R2_ENDPOINT": "https://abc123.r2.cloudflarestorage.com",
    "R2_ACCESS_KEY_ID": "access-key",
    "R2_SECRET_ACCESS_KEY": "secret-key",
    "R2_BUCKET_NAME": "ie-orbit-media",
    "R2_REGION": "auto",
    "R2_PUBLIC_BASE_URL": "",
    "R2_SIGNED_URL_TTL_PUBLIC": 3600,
    "R2_SIGNED_URL_TTL_PRIVATE": 120,
}


def test_factory_returns_s3_provider_for_r2_alias() -> None:
    with override_settings(PLATFORM_MEDIA_STORAGE_PROVIDER="r2", **R2_SETTINGS):
        provider = get_storage_provider()
    assert isinstance(provider, S3CompatibleStorageProvider)
    assert provider.code == "s3"


def test_s3_provider_requires_credentials() -> None:
    with override_settings(
        R2_ENDPOINT="",
        R2_ACCESS_KEY_ID="",
        R2_SECRET_ACCESS_KEY="",
        R2_BUCKET_NAME="",
    ):
        with pytest.raises(ImproperlyConfigured):
            S3CompatibleStorageProvider()


@override_settings(**R2_SETTINGS)
def test_s3_provider_save_delete_and_signed_urls() -> None:
    provider = S3CompatibleStorageProvider()
    client = MagicMock()
    client.generate_presigned_url.return_value = "https://signed.example/object"
    body = MagicMock()
    body.read.return_value = b"stored-bytes"
    client.get_object.return_value = {"Body": body}

    with patch.object(S3CompatibleStorageProvider, "_client", client, create=True):
        stored = provider.save(
            path="tenants/t1/file.txt",
            file_obj=BytesIO(b"hello"),
            content_type="text/plain",
        )
        provider.delete(path="tenants/t1/file.txt")
        payload = provider.read_bytes(path="tenants/t1/file.txt")
        private_url = provider.private_url(path="tenants/t1/file.txt")

    client.put_object.assert_called_once()
    client.delete_object.assert_called_once()
    assert stored.storage_provider == "s3"
    assert stored.storage_path == "tenants/t1/file.txt"
    assert payload == b"stored-bytes"
    assert private_url == "https://signed.example/object"
    assert "secret-key" not in stored.public_url
    assert "secret-key" not in stored.private_url
