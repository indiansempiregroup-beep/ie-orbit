from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class NotificationProvider(ABC):
    @abstractmethod
    def send(self, *, template: Any, recipient: Any, context: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError
