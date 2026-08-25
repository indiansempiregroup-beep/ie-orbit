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
from apps.platform_media.utils.images import export_webp_variant, extract_image_metadata
from apps.platform_media.validators import validate_file_upload

logger = logging.getLogger("ie_orbit.media")


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
        variant_metadata = self._store_image_variants(
            provider=provider,
            uploaded_file=uploaded_file,
            storage_path=storage_path,
            media_type=media_type,
        )
        payload_metadata = {
            **(metadata or {}),
            "virus_scan": {
                "provider": scan_result.provider,
                "details": scan_result.details,
            },
            **variant_metadata,
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
        file_url = f"/api/v1/media/{media.id}/file"
        payload_metadata["public_url"] = file_url
        payload_metadata["private_url"] = file_url
        if payload_metadata.get("thumbnail_path"):
            payload_metadata["thumbnail_url"] = f"{file_url}?variant=thumb"
        media.metadata = payload_metadata
        media.save(update_fields=["metadata", "updated_at"])
        if business and "logo" in media.tags:
            logo_url = file_url
            if getattr(business, "logo", "") != logo_url:
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
        existing = MediaFolder.objects.filter(tenant=tenant, folder_type=folder_type)
        existing = (
            existing.filter(business__isnull=True)
            if business is None
            else existing.filter(business=business)
        )
        folder = existing.first()
        if folder:
            return folder
        path = self._object_prefix(
            tenant=tenant,
            business=business,
            folder_type=folder_type,
        )
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

    def _object_prefix(
        self,
        *,
        tenant: Any,
        business: Any | None,
        folder_type: str,
    ) -> str:
        business_part = str(getattr(business, "id", "shared"))
        kind = (folder_type or MediaFolderType.BUSINESS).strip().strip("/")
        return f"tenants/{tenant.id}/businesses/{business_part}/{kind}"

    def _storage_path(
        self,
        *,
        tenant: Any,
        business: Any | None,
        folder: MediaFolder | None,
        folder_type: str,
        filename: str,
    ) -> str:
        kind = folder.folder_type if folder else folder_type
        return f"{self._object_prefix(tenant=tenant, business=business, folder_type=kind)}/{filename}"

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

    def _store_image_variants(
        self,
        *,
        provider: Any,
        uploaded_file: UploadedFile,
        storage_path: str,
        media_type: str,
    ) -> dict[str, Any]:
        if media_type != MediaType.IMAGE:
            return {}
        stem = storage_path.rsplit(".", 1)[0]
        variants: dict[str, Any] = {}
        try:
            uploaded_file.seek(0)
            display = export_webp_variant(uploaded_file, max_size=(1600, 1600))
            display_path = f"{stem}.display.webp"
            provider.save(path=display_path, file_obj=display, content_type="image/webp")
            variants["display_path"] = display_path
            uploaded_file.seek(0)
            thumb = export_webp_variant(uploaded_file, max_size=(400, 400))
            thumb_path = f"{stem}.thumb.webp"
            provider.save(path=thumb_path, file_obj=thumb, content_type="image/webp")
            variants["thumbnail_path"] = thumb_path
        except Exception:
            logger.debug("Unable to generate image variants", exc_info=True)
        return variants

    def _image_metadata(self, uploaded_file: UploadedFile, media_type: str) -> Any | None:
        if media_type != MediaType.IMAGE:
            return None
        try:
            return extract_image_metadata(uploaded_file)
        except Exception:
            logger.debug("Unable to extract image metadata", exc_info=True)
            return None
