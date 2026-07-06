from __future__ import annotations

import re

from django.core.exceptions import ValidationError

HEX_COLOR_PATTERN = re.compile(r"^#(?:[0-9a-fA-F]{3}){1,2}$")


def validate_non_empty(value: str) -> None:
    if not value or not value.strip():
        raise ValidationError("Value cannot be empty.")


def validate_hex_color(value: str) -> None:
    if not HEX_COLOR_PATTERN.fullmatch(value):
        raise ValidationError("Value must be a valid hex color.")
