from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError


def validate_latitude(value: Decimal | None) -> None:
    if value is None:
        return
    if value < Decimal("-90") or value > Decimal("90"):
        raise ValidationError("Latitude must be between -90 and 90.")


def validate_longitude(value: Decimal | None) -> None:
    if value is None:
        return
    if value < Decimal("-180") or value > Decimal("180"):
        raise ValidationError("Longitude must be between -180 and 180.")


def validate_tags(value: Any) -> None:
    if value in (None, ""):
        return
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValidationError("Tags must be a list of strings.")
