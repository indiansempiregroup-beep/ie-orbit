from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction

from apps.platform_media.models import (
    Media,
    MediaFolder,
    MediaFolderType,
    MediaType,
    MediaVisibility,
)
from apps.platform_media.repositories import MediaRepository
from apps.platform_media.services.security import VirusScanService
from apps.platform_media.storage import get_storage_provider
from apps.platform_media.utils.files import calculate_checksum, normalize_filename, storage_filename
from apps.platform_media.utils.images import extract_image_metadata
from apps.platform_media.validators import validate_file_upload
from apps.common.utils.urls import normalize_stored_asset_url

logger = logging.getLogger("ie_platform.media")


@dataclass(frozen=True)
class UploadedMediaResult:
    media: Media
    duplicate: bool = False


class MediaService:
    def __init__(
        self,
        *,
        repository: MediaRepository | None = None,
        virus_scan_service: VirusScanService | None = None,
    ) -> None:
        self.repository = repository or MediaRepository()
        self.virus_scan_service = virus_scan_service or VirusScanService()

    @transaction.atomic
    def upload(
        self,
        *,
        uploaded_file: UploadedFile,
        tenant: Any,
        business: Any | None,
        uploaded_by: Any,
        folder: MediaFolder | None = None,
        folder_type: str = "business",
        visibility: str = MediaVisibility.PRIVATE,
        tags: list[str] | None = None,
        display_name: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> UploadedMediaResult:
        validation = validate_file_upload(uploaded_file)
        scan_result = self.virus_scan_service.scan(uploaded_file)
        if not scan_result.clean:
            raise ValidationError("Uploaded file failed security scan.")

        checksum = calculate_checksum(uploaded_file)
        provider = get_storage_provider()
        duplicate = self.repository.find_duplicate(
            tenant=tenant,
            checksum=checksum,
            provider=provider.code,
        )
        if duplicate:
            return UploadedMediaResult(media=duplicate, duplicate=True)

        original_filename = normalize_filename(uploaded_file.name)
        generated_filename = storage_filename(original_filename)
        media_type = self._media_type(validation.mime_type, validation.extension)
        folder = folder or self.ensure_folder(
            tenant=tenant,
            business=business,
            folder_type=folder_type,
        )
        storage_path = self._storage_path(
            tenant=tenant,
            business=business,
            folder=folder,
            folder_type=folder_type,
            filename=generated_filename,
        )
        stored = provider.save(
            path=storage_path,
            file_obj=uploaded_file,
            content_type=validation.mime_type,
        )
        uploaded_file.seek(0)
        image_metadata = self._image_metadata(uploaded_file, media_type)
        payload_metadata = {
            **(metadata or {}),
            "public_url": normalize_stored_asset_url(stored.public_url),
            "private_url": normalize_stored_asset_url(stored.private_url),
            "virus_scan": {
                "provider": scan_result.provider,
                "details": scan_result.details,
            },
        }
        if image_metadata:
            payload_metadata["image"] = image_metadata.as_dict()

        media = Media(
            tenant=tenant,
            business=business,
            uploaded_by=uploaded_by if getattr(uploaded_by, "is_authenticated", False) else None,
            folder=folder,
            media_type=media_type,
            original_filename=uploaded_file.name,
            storage_filename=generated_filename,
            display_name=display_name or Path(original_filename).stem,
            file_extension=validation.extension,
            mime_type=validation.mime_type,
            file_size=validation.file_size,
            width=image_metadata.width if image_metadata else None,
            height=image_metadata.height if image_metadata else None,
            storage_provider=provider.code,
            storage_path=stored.storage_path,
            checksum=checksum,
            visibility=visibility,
            tags=[tag.strip().lower() for tag in (tags or []) if tag.strip()],
            metadata=payload_metadata,
        )
        if getattr(uploaded_by, "is_authenticated", False):
            media.mark_created(actor_id=uploaded_by.id)
        media.full_clean()
        media.save()
        if business and "logo" in media.tags:
            logo_url = str(media.metadata.get("public_url", ""))
            if logo_url and getattr(business, "logo", "") != logo_url:
                business.logo = logo_url
                business.save(update_fields=["logo", "updated_at"])
        logger.info(
            "Media uploaded",
            extra={"media_id": str(media.id), "tenant_id": str(tenant.id)},
        )
        return UploadedMediaResult(media=media)

    def upload_multiple(
        self,
        *,
        files: list[UploadedFile],
        tenant: Any,
        business: Any | None,
        uploaded_by: Any,
        folder: MediaFolder | None = None,
        folder_type: str = "business",
        visibility: str = MediaVisibility.PRIVATE,
        tags: list[str] | None = None,
    ) -> list[UploadedMediaResult]:
        return [
            self.upload(
                uploaded_file=file,
                tenant=tenant,
                business=business,
                uploaded_by=uploaded_by,
                folder=folder,
                folder_type=folder_type,
                visibility=visibility,
                tags=tags,
            )
            for file in files
        ]

    def ensure_folder(
        self,
        *,
        tenant: Any,
        business: Any | None,
        folder_type: str,
    ) -> MediaFolder:
        business_part = str(getattr(business, "id", "shared"))
        path = f"businesses/{business_part}/{folder_type}"
        folder, _ = MediaFolder.objects.get_or_create(
            tenant=tenant,
            path=path,
            defaults={
                "business": business,
                "folder_type": folder_type,
                "name": MediaFolderType(folder_type).label,
            },
        )
        return folder

    @transaction.atomic
    def update_media(self, *, media: Media, data: dict[str, Any], actor: Any) -> Media:
        for field, value in data.items():
            setattr(media, field, value)
        if getattr(actor, "is_authenticated", False):
            media.mark_updated(actor_id=actor.id)
        media.full_clean()
        media.save()
        return media

    @transaction.atomic
    def delete_media(self, *, media: Media, actor: Any) -> None:
        provider = get_storage_provider(media.storage_provider)
        provider.delete(path=media.storage_path)
        deleted_by = (
            getattr(actor, "id", None) if getattr(actor, "is_authenticated", False) else None
        )
        media.soft_delete(deleted_by=deleted_by)

    @transaction.atomic
    def restore_media(self, *, media: Media, actor: Any) -> Media:
        media.restore(restored_by=getattr(actor, "id", None))
        return media

    def _storage_path(
        self,
        *,
        tenant: Any,
        business: Any | None,
        folder: MediaFolder | None,
        folder_type: str,
        filename: str,
    ) -> str:
        folder_path = folder.path if folder else folder_type
        business_part = str(getattr(business, "id", "shared"))
        return f"tenants/{tenant.id}/businesses/{business_part}/{folder_path}/{filename}"

    def _media_type(self, mime_type: str, extension: str) -> str:
        if mime_type.startswith("image/"):
            return MediaType.IMAGE
        if mime_type.startswith("video/"):
            return MediaType.VIDEO
        if mime_type.startswith("audio/"):
            return MediaType.AUDIO
        if extension == "pdf" or mime_type == "application/pdf":
            return MediaType.PDF
        if mime_type.startswith("text/") or "document" in mime_type or "sheet" in mime_type:
            return MediaType.DOCUMENT
        return MediaType.OTHER

    def _image_metadata(self, uploaded_file: UploadedFile, media_type: str) -> Any | None:
        if media_type != MediaType.IMAGE:
            return None
        try:
            return extract_image_metadata(uploaded_file)
        except Exception:
            logger.debug("Unable to extract image metadata", exc_info=True)
            return None
