from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from rest_framework import serializers

COORDINATE_MAX_DIGITS = 9
COORDINATE_DECIMAL_PLACES = 6


class CoordinateField(serializers.DecimalField):
    """A latitude/longitude field that rounds instead of rejecting map input.

    Google Maps and device GPS report far more decimals than the columns keep,
    so a pin the user placed correctly would otherwise fail validation with
    "no more than 6 decimal places".
    """

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("max_digits", COORDINATE_MAX_DIGITS)
        kwargs.setdefault("decimal_places", COORDINATE_DECIMAL_PLACES)
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_null", True)
        super().__init__(**kwargs)

    def to_internal_value(self, data: Any) -> Decimal:
        try:
            value = Decimal(str(data).strip())
        except (InvalidOperation, ValueError, TypeError, AttributeError):
            return super().to_internal_value(data)
        if not value.is_finite():
            return super().to_internal_value(data)
        exponent = Decimal(1).scaleb(-(self.decimal_places or 0))
        return super().to_internal_value(
            str(value.quantize(exponent, rounding=ROUND_HALF_UP))
        )
