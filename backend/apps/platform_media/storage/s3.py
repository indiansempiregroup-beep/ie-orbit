from __future__ import annotations

from functools import cached_property
from io import BytesIO
from typing import BinaryIO

import boto3
from botocore.config import Config
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from apps.platform_media.storage.interface import StorageProviderInterface, StoredObject


class S3CompatibleStorageProvider(StorageProviderInterface):
    """S3-compatible object storage used for Cloudflare R2 and Amazon S3."""

    code = "s3"

    def __init__(self, *, provider_code: str = "s3") -> None:
        self.code = provider_code
        missing = [
            name
            for name, value in (
                ("R2_ENDPOINT", getattr(settings, "R2_ENDPOINT", "")),
                ("R2_ACCESS_KEY_ID", getattr(settings, "R2_ACCESS_KEY_ID", "")),
                ("R2_SECRET_ACCESS_KEY", getattr(settings, "R2_SECRET_ACCESS_KEY", "")),
                ("R2_BUCKET_NAME", getattr(settings, "R2_BUCKET_NAME", "")),
            )
            if not value
        ]
        if missing:
            names = ", ".join(missing)
            raise ImproperlyConfigured(
                f"S3-compatible storage requires environment variables: {names}"
            )

    @cached_property
    def _client(self):
        return boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name=getattr(settings, "R2_REGION", "auto") or "auto",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    @property
    def _bucket(self) -> str:
        return settings.R2_BUCKET_NAME

    def save(self, *, path: str, file_obj: BinaryIO, content_type: str) -> StoredObject:
        body = _read_body(file_obj)
        self._client.put_object(
            Bucket=self._bucket,
            Key=path,
            Body=body,
            ContentType=content_type or "application/octet-stream",
        )
        return StoredObject(
            storage_provider=self.code,
            storage_path=path,
            public_url=self.public_url(path=path),
            private_url=self.private_url(path=path),
        )

    def delete(self, *, path: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=path)

    def restore(self, *, path: str) -> None:
        return None

    def public_url(self, *, path: str) -> str:
        public_base = getattr(settings, "R2_PUBLIC_BASE_URL", "")
        if public_base:
            return f"{public_base.rstrip('/')}/{path.lstrip('/')}"
        ttl = int(getattr(settings, "R2_SIGNED_URL_TTL_PUBLIC", 86400))
        return self._presign(path=path, expires=ttl)

    def private_url(self, *, path: str) -> str:
        return self._presign(
            path=path,
            expires=int(getattr(settings, "R2_SIGNED_URL_TTL_PRIVATE", 900)),
        )

    def read_bytes(self, *, path: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=path)
        return response["Body"].read()

    def _presign(self, *, path: str, expires: int) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": path},
            ExpiresIn=max(expires, 1),
        )


def _read_body(file_obj: BinaryIO) -> bytes:
    if hasattr(file_obj, "seek"):
        try:
            file_obj.seek(0)
        except Exception:
            pass
    if hasattr(file_obj, "chunks"):
        buffer = BytesIO()
        for chunk in file_obj.chunks():
            buffer.write(chunk)
        return buffer.getvalue()
    data = file_obj.read()
    return data if isinstance(data, bytes) else bytes(data)
