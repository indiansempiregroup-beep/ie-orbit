from __future__ import annotations

from decimal import Decimal

import pytest

from apps.businesses.api.branch_serializers import BranchSerializer
from apps.common.api.fields import CoordinateField


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Google Maps and device GPS routinely report more precision than we store.
        ("18.4590741234", Decimal("18.459074")),
        (18.4590741234, Decimal("18.459074")),
        ("-73.8462495", Decimal("-73.846250")),
        ("73.846249", Decimal("73.846249")),
        ("18", Decimal("18.000000")),
    ],
)
def test_coordinate_field_rounds_to_stored_precision(raw, expected) -> None:
    assert CoordinateField().to_internal_value(raw) == expected


def test_coordinate_field_still_rejects_non_numeric_input() -> None:
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        CoordinateField().to_internal_value("near the market")


@pytest.mark.django_db
def test_office_accepts_a_high_precision_map_pin() -> None:
    serializer = BranchSerializer(
        data={
            "branch_code": "DHK",
            "branch_name": "Dhankawadi",
            "display_name": "Dhankawadi",
            "latitude": "18.4590741234",
            "longitude": "73.8462491234",
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["latitude"] == Decimal("18.459074")
    assert serializer.validated_data["longitude"] == Decimal("73.846249")


def test_office_create_payload_does_not_require_branch_code() -> None:
    serializer = BranchSerializer(
        data={
            "branch_name": "Downtown clinic",
            "display_name": "Downtown clinic",
            "address_line1": "123 Main St",
            "city": "Mumbai",
            "country": "India",
            "latitude": "18.459074",
            "longitude": "73.846249",
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert "branch_code" not in serializer.validated_data
