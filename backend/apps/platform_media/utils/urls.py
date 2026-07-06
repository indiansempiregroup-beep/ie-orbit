from __future__ import annotations

from apps.platform_media.models import Media


def media_public_url(media: Media) -> str:
    return media.storage_path


def media_private_url(media: Media) -> str:
    return media.storage_path


def media_thumbnail_url(media: Media) -> str:
    return media.metadata.get("thumbnail_url", media.storage_path)
