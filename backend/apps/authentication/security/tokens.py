from __future__ import annotations

import hashlib
import secrets


def generate_plain_token(byte_length: int = 32) -> str:
    return secrets.token_urlsafe(byte_length)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_otp_code(length: int = 6) -> str:
    upper_bound = 10**length
    return f"{secrets.randbelow(upper_bound):0{length}d}"
