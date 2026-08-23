from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

_PREFIX = "enc:"


def _fernet() -> Fernet:
    digest = hashlib.sha256(str(settings.SECRET_KEY).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    plain = str(value or "").strip()
    if not plain or plain.startswith(_PREFIX):
        return plain
    return _PREFIX + _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    stored = str(value or "")
    if not stored.startswith(_PREFIX):
        return stored
    try:
        return _fernet().decrypt(stored[len(_PREFIX) :].encode("ascii")).decode("utf-8")
    except InvalidToken:
        return ""


def mask_secret(value: str) -> str:
    return "••••••••" if str(value or "").strip() else ""
