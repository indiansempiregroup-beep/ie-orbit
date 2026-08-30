from __future__ import annotations

from io import BytesIO

from django.core.management.base import BaseCommand

from apps.platform_media.folders import (
    classify_legacy_folder_type,
    folder_type_from_path,
    intended_folder_type,
    is_legacy_business_path,
    rewrite_folder_segment,
)
from apps.platform_media.models import Media
from apps.platform_media.services import MediaService
from apps.platform_media.storage import get_storage_provider


class Command(BaseCommand):
    help = (
        "Move media objects into purpose-named folders (branding, products, services, staff, customers, pets)."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print planned moves without copying or updating rows.",
        )

    def handle(self, *args, **options) -> None:
        dry_run = bool(options.get("dry_run"))
        service = MediaService()
        moved = 0
        skipped = 0
        missing = 0
        queryset = Media.objects.select_related("folder", "business", "tenant")
        for media in queryset.iterator():
            metadata = media.metadata if isinstance(media.metadata, dict) else {}
            current = folder_type_from_path(media.storage_path)
            new_type = intended_folder_type(tags=media.tags)
            if new_type is None and any(
                is_legacy_business_path(path)
                for path in (
                    media.storage_path,
                    str(metadata.get("display_path") or ""),
                    str(metadata.get("thumbnail_path") or ""),
                )
            ):
                new_type = classify_legacy_folder_type(tags=media.tags)
            if not new_type or current == new_type:
                skipped += 1
                continue
            new_storage = rewrite_folder_segment(media.storage_path, new_type)
            self.stdout.write(f"{media.id} {media.storage_path} -> {new_storage}")
            if dry_run:
                moved += 1
                continue
            provider = get_storage_provider(media.storage_provider)
            copies = [
                (media.storage_path, new_storage, media.mime_type or "application/octet-stream")
            ]
            display = str(metadata.get("display_path") or "")
            thumb = str(metadata.get("thumbnail_path") or "")
            if display:
                copies.append((display, rewrite_folder_segment(display, new_type), "image/webp"))
            if thumb:
                copies.append((thumb, rewrite_folder_segment(thumb, new_type), "image/webp"))
            copied: list[tuple[str, str]] = []
            try:
                for old_path, new_path, content_type in copies:
                    if not old_path or old_path == new_path:
                        continue
                    body = _read_object(provider, old_path)
                    if body is None:
                        raise FileNotFoundError(old_path)
                    provider.save(
                        path=new_path,
                        file_obj=BytesIO(body),
                        content_type=content_type,
                    )
                    copied.append((old_path, new_path))
            except FileNotFoundError as exc:
                missing += 1
                self.stderr.write(f"Missing object for {media.id}: {exc}")
                continue
            for old_path, _new_path in copied:
                provider.delete(path=old_path)
            folder = service.ensure_folder(
                tenant=media.tenant,
                business=media.business,
                folder_type=new_type,
            )
            media.storage_path = new_storage
            media.folder = folder
            if display:
                metadata["display_path"] = rewrite_folder_segment(display, new_type)
            if thumb:
                metadata["thumbnail_path"] = rewrite_folder_segment(thumb, new_type)
            media.metadata = metadata
            media.save(update_fields=["storage_path", "folder", "metadata", "updated_at"])
            moved += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Rekeyed {moved} media row(s); skipped {skipped}; missing {missing}."
                + (" (dry-run)" if dry_run else "")
            )
        )


def _read_object(provider, path: str) -> bytes | None:
    try:
        return provider.read_bytes(path=path)
    except FileNotFoundError:
        return None
    except Exception as exc:
        response = getattr(exc, "response", None)
        code = ""
        if isinstance(response, dict):
            code = str((response.get("Error") or {}).get("Code") or "")
        if code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise
