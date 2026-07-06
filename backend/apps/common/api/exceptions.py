from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.views import exception_handler

from apps.common.api.responses import error_response, validation_response

logger = logging.getLogger("ie_platform.exceptions")


def global_exception_handler(exc: Exception, context: dict[str, Any]) -> Any:
    response = exception_handler(exc, context)

    if isinstance(exc, exceptions.ValidationError):
        return validation_response(response.data if response else _detail(exc))

    if isinstance(exc, (exceptions.AuthenticationFailed, exceptions.NotAuthenticated)):
        return error_response(
            code="AUTHENTICATION_FAILED",
            message="Authentication credentials were not provided or are invalid.",
            details=_response_details(response),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if isinstance(exc, (exceptions.PermissionDenied, PermissionDenied)):
        return error_response(
            code="PERMISSION_DENIED",
            message="You do not have permission to perform this action.",
            details=_response_details(response),
            status_code=status.HTTP_403_FORBIDDEN,
        )

    if isinstance(exc, (exceptions.NotFound, Http404)):
        return error_response(
            code="NOT_FOUND",
            message="The requested resource was not found.",
            details=_response_details(response),
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if response is not None:
        return error_response(
            code=str(getattr(exc, "default_code", "API_ERROR")).upper(),
            message=_message_from_detail(response.data),
            details=response.data,
            status_code=response.status_code,
        )

    logger.exception("Unhandled API exception", exc_info=exc, extra={"context": context})
    return error_response(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _response_details(response: Any) -> Any:
    return getattr(response, "data", None)


def _detail(exc: Exception) -> Any:
    return getattr(exc, "detail", str(exc))


def _message_from_detail(detail: Any) -> str:
    if isinstance(detail, dict) and "detail" in detail:
        return str(detail["detail"])
    if isinstance(detail, (dict, list)):
        return "One or more request fields are invalid."
    return str(detail)
