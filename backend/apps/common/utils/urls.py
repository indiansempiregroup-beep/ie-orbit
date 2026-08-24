from __future__ import annotations

import os
from urllib.parse import urlparse


def normalize_stored_asset_url(url: str) -> str:
    """Normalize asset URLs for database storage (relative paths preferred)."""
    trimmed = url.strip()
    if not trimmed:
        return ""
    if trimmed.startswith(("http://", "https://")):
        public_base = os.getenv("R2_PUBLIC_BASE_URL", "").strip().rstrip("/")
        if public_base and trimmed.startswith(public_base):
            return trimmed
        path = urlparse(trimmed).path
        return path if path.startswith("/") else f"/{path}"
    return trimmed if trimmed.startswith("/") else f"/{trimmed}"


def normalize_public_asset_url(url: str) -> str:
    """Return a browser-ready asset URL, preserving relative paths when possible."""
    stored = normalize_stored_asset_url(url)
    if not stored:
        return ""
    if url.strip().startswith(("http://", "https://")):
        return url.strip()
    return stored
