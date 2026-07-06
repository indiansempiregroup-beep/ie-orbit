from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError


def validate_tags(value: Any) -> None:
    if not isinstance(value, list):
        raise ValidationError("Tags must be a list.")
    if any(not isinstance(item, str) or not item.strip() for item in value):
        raise ValidationError("Tags must contain non-empty strings.")
