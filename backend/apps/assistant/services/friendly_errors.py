"""Turn tool/API failures into chat-friendly assistant replies."""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError

UNKNOWN_REPLY = (
    "I’m not able to help with that yet.\n\n"
    "Try a suggestion chip below, or ask “What can you do?” to see what I support."
)

GENERIC_FAIL_REPLY = (
    "I couldn’t complete that right now.\n\n"
    "Try again, pick a suggestion chip, or ask “What can you do?”"
)


def stringify_detail(value: Any) -> str:
    if isinstance(value, list):
        parts = [stringify_detail(item) for item in value if item is not None]
        return next((part for part in parts if part), "")
    return str(value).strip()


def humanize_technical_error(message: str) -> str:
    lowered = message.lower()
    if "uuid" in lowered or "must be a valid uuid" in lowered:
        return (
            "I couldn’t find that record. Tap an item from the list, "
            "or ask “What can you do?” for supported questions."
        )
    if "one or more request fields are invalid" in lowered:
        return GENERIC_FAIL_REPLY
    return message


def validation_message(exc: Exception) -> str:
    """Turn API/ORM validation failures into a chat-friendly reply."""
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, "message_dict") and exc.message_dict:
            for key, value in exc.message_dict.items():
                msg = stringify_detail(value)
                if msg:
                    return humanize_technical_error(msg)
        if getattr(exc, "messages", None):
            return humanize_technical_error(str(exc.messages[0]))
        return humanize_technical_error(str(exc))

    if isinstance(exc, ValidationError):
        detail = exc.detail
        if isinstance(detail, dict):
            if detail.get("detail") is not None:
                return humanize_technical_error(stringify_detail(detail.get("detail")))
            for key, value in detail.items():
                if key == "code":
                    continue
                msg = stringify_detail(value)
                if msg:
                    return humanize_technical_error(msg)
        if isinstance(detail, list) and detail:
            return humanize_technical_error(stringify_detail(detail[0]))
        if detail is not None:
            return humanize_technical_error(stringify_detail(detail))

    text = str(exc).strip()
    return humanize_technical_error(text) if text else GENERIC_FAIL_REPLY
