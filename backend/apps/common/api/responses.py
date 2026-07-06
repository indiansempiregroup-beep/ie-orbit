from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.utils import timezone
from rest_framework.response import Response


@dataclass(frozen=True)
class ApiMeta:
    request_id: str | None = None
    timestamp: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "timestamp": self.timestamp or timezone.now().isoformat(),
        }


@dataclass(frozen=True)
class ApiSuccess[T]:
    data: T
    meta: ApiMeta

    def as_dict(self) -> dict[str, Any]:
        return {"data": self.data, "meta": self.meta.as_dict()}


@dataclass(frozen=True)
class ApiError:
    code: str
    message: str
    details: Any = None

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "error": {
                "code": self.code,
                "message": self.message,
            }
        }
        if self.details is not None:
            payload["error"]["details"] = self.details
        return payload


def success_response(
    data: Any,
    *,
    status_code: int = 200,
    request_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> Response:
    payload = ApiSuccess(data=data, meta=ApiMeta(request_id=request_id)).as_dict()
    if meta:
        payload["meta"].update(meta)
    return Response(payload, status=status_code)


def error_response(
    *,
    code: str,
    message: str,
    status_code: int,
    details: Any = None,
) -> Response:
    return Response(
        ApiError(code=code, message=message, details=details).as_dict(),
        status=status_code,
    )


def validation_response(details: Any) -> Response:
    return error_response(
        code="VALIDATION_FAILED",
        message="One or more request fields are invalid.",
        details=details,
        status_code=422,
    )


def pagination_meta(
    *,
    next_cursor: str | None,
    previous_cursor: str | None,
    page_size: int,
) -> dict[str, Any]:
    return {
        "pagination": {
            "next_cursor": next_cursor,
            "previous_cursor": previous_cursor,
            "page_size": page_size,
        }
    }
