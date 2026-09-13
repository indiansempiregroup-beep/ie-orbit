from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from django.conf import settings

_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0"}


def media_file_path(media_id: str) -> str:
    return f"/api/v1/media/{str(media_id).strip()}/file"


def absolute_media_file_url(media_id: str) -> str:
    return absolutize_proof_url(media_file_path(media_id))


def absolutize_proof_url(url: str) -> str:
    proof = str(url or "").strip()
    if not proof:
        return ""
    if proof.startswith("http://") or proof.startswith("https://"):
        return proof
    origin = str(getattr(settings, "PUBLIC_API_ORIGIN", "") or "http://localhost:8000").rstrip("/")
    if proof.startswith("/"):
        return f"{origin}{proof}"
    return f"{origin}/{proof}"


def reachable_proof_url(url: str) -> str:
    """Drop loopback hosts so phones and LAN browsers can resolve the file."""
    proof = str(url or "").strip()
    if not proof:
        return ""
    parsed = urlparse(proof)
    if parsed.scheme in {"http", "https"} and parsed.hostname in _LOOPBACK_HOSTS:
        path = parsed.path or "/"
        if parsed.query:
            return f"{path}?{parsed.query}"
        return path
    return proof


def proof_url_from_meta(meta: dict[str, Any] | None) -> str:
    payload = meta or {}
    media_id = str(payload.get("payment_proof_media_id") or "").strip()
    if media_id:
        return reachable_proof_url(absolute_media_file_url(media_id))
    return reachable_proof_url(absolutize_proof_url(str(payload.get("payment_proof_url") or "")))


def resolve_payment_proof_url(
    *,
    payment_proof_url: str = "",
    payment_proof_media_id: str = "",
) -> tuple[str, str]:
    """Return (stored_url, media_id) for a UPI screenshot."""
    media_id = str(payment_proof_media_id or "").strip()
    if media_id:
        return media_file_path(media_id), media_id
    proof = str(payment_proof_url or "").strip()
    if not proof:
        return "", ""
    if "/media/" in proof and "/file" in proof:
        try:
            media_id = proof.split("/media/")[1].split("/")[0]
        except IndexError:
            media_id = ""
    return proof, media_id
