from __future__ import annotations

from pathlib import Path
from typing import BinaryIO

from django.conf import settings

from apps.platform_media.storage.interface import StorageProviderInterface, StoredObject


class LocalStorageProvider(StorageProviderInterface):
    code = "local"

    def __init__(self, *, root: Path | None = None, base_url: str | None = None) -> None:
        configured_root = getattr(
            settings,
            "PLATFORM_MEDIA_LOCAL_ROOT",
            settings.MEDIA_ROOT / "uploads",
        )
        self.root = root or Path(configured_root)
        configured_url = base_url or getattr(
            settings,
            "PLATFORM_MEDIA_LOCAL_URL",
            "/media/uploads/",
        )
        self.base_url = configured_url.rstrip("/")

    def save(self, *, path: str, file_obj: BinaryIO, content_type: str) -> StoredObject:
        destination = self._safe_path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as target:
            for chunk in _chunks(file_obj):
                target.write(chunk)
        return StoredObject(
            storage_provider=self.code,
            storage_path=path,
            public_url=self.public_url(path=path),
            private_url=self.private_url(path=path),
        )

    def delete(self, *, path: str) -> None:
        target = self._safe_path(path)
        if target.exists():
            target.unlink()

    def restore(self, *, path: str) -> None:
        return None

    def public_url(self, *, path: str) -> str:
        return f"{self.base_url}/{path.lstrip('/')}"

    def private_url(self, *, path: str) -> str:
        return self.public_url(path=path)

    def read_bytes(self, *, path: str) -> bytes:
        target = self._safe_path(path)
        if not target.exists() or not target.is_file():
            raise FileNotFoundError(path)
        return target.read_bytes()

    def _safe_path(self, path: str) -> Path:
        target = (self.root / path).resolve()
        root = self.root.resolve()
        if root not in target.parents and target != root:
            raise ValueError("Invalid storage path.")
        return target


def _chunks(file_obj: BinaryIO) -> object:
    if hasattr(file_obj, "chunks"):
        return file_obj.chunks()
    return iter(lambda: file_obj.read(1024 * 1024), b"")
