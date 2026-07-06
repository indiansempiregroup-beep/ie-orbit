from __future__ import annotations

from django.core.exceptions import ValidationError

from apps.core.db.uuid import is_uuid_v7, is_valid_uuid


def validate_uuid(value: object) -> None:
    if not is_valid_uuid(value):
        raise ValidationError("Value must be a valid UUID.")


def validate_uuid_v7(value: object) -> None:
    if not is_uuid_v7(value):
        raise ValidationError("Value must be a UUID version 7 value.")


def validate_tenant_id(value: object) -> None:
    validate_uuid(value)
