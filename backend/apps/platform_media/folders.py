from __future__ import annotations

from apps.platform_media.models import MediaFolderType

LEGACY_FOLDER_TYPE = MediaFolderType.BUSINESS


def _tagset(tags: list[str] | None) -> set[str]:
    return {str(item).strip().lower() for item in (tags or []) if str(item).strip()}


def intended_folder_type(*, tags: list[str] | None) -> str | None:
    tagset = _tagset(tags)
    if "profile" in tagset:
        return MediaFolderType.CUSTOMERS if "customer" in tagset else MediaFolderType.STAFF
    if "pet" in tagset:
        return MediaFolderType.PETS
    if "product" in tagset or (
        "shop" in tagset and "logo" not in tagset and "branding" not in tagset
    ):
        return MediaFolderType.PRODUCTS
    if "service" in tagset:
        return MediaFolderType.SERVICES
    if "logo" in tagset or "branding" in tagset:
        return MediaFolderType.BRANDING
    if "upi_proof" in tagset or "whatsapp" in tagset:
        return MediaFolderType.DOCUMENTS
    if "ad" in tagset:
        return MediaFolderType.BRANDING
    return None


def classify_legacy_folder_type(*, tags: list[str] | None) -> str:
    return intended_folder_type(tags=tags) or MediaFolderType.BRANDING


def folder_type_from_path(path: str) -> str:
    parts = [part for part in (path or "").split("/") if part]
    if len(parts) >= 6 and parts[0] == "tenants" and parts[2] == "businesses":
        return parts[4]
    return ""


def rewrite_folder_segment(path: str, new_folder_type: str) -> str:
    parts = [part for part in (path or "").split("/") if part]
    if len(parts) >= 6 and parts[0] == "tenants" and parts[2] == "businesses":
        parts[4] = new_folder_type
        return "/".join(parts)
    return path


def is_legacy_business_path(path: str) -> bool:
    return folder_type_from_path(path) == LEGACY_FOLDER_TYPE
