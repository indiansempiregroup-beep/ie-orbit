from __future__ import annotations

import secrets
import time
import uuid

UUID_VERSION_7 = 7
UUID_VARIANT_RFC_4122_BITS = 0b10


def generate_uuid() -> uuid.UUID:
    return generate_uuid_v7()


def generate_uuid_v7() -> uuid.UUID:
    timestamp_ms = int(time.time() * 1000) & ((1 << 48) - 1)
    random_a = secrets.randbits(12)
    random_b = secrets.randbits(62)

    value = timestamp_ms << 80
    value |= UUID_VERSION_7 << 76
    value |= random_a << 64
    value |= UUID_VARIANT_RFC_4122_BITS << 62
    value |= random_b
    return uuid.UUID(int=value)


def is_valid_uuid(value: object) -> bool:
    try:
        uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return False
    return True


def is_uuid_v7(value: object) -> bool:
    try:
        parsed = uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return False
    return parsed.version == UUID_VERSION_7
