from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import BinaryIO


@dataclass(frozen=True)
class StoredObject:
    storage_provider: str
    storage_path: str
    public_url: str
    private_url: str


class StorageProviderInterface(ABC):
    code: str

    @abstractmethod
    def save(self, *, path: str, file_obj: BinaryIO, content_type: str) -> StoredObject:
        raise NotImplementedError

    @abstractmethod
    def delete(self, *, path: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def restore(self, *, path: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def public_url(self, *, path: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def private_url(self, *, path: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def read_bytes(self, *, path: str) -> bytes:
        raise NotImplementedError
