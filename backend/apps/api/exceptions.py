from __future__ import annotations

from typing import Any

from apps.common.api.exceptions import global_exception_handler


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Any:
    return global_exception_handler(exc, context)
