from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile

DEFAULT_ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".txt",
    ".csv",
    ".mp4",
    ".mov",
    ".mp3",
    ".wav",
}
DEFAULT_ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
    "video/mp4",
    "video/quicktime",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
}


@dataclass(frozen=True)
class MediaValidationResult:
    extension: str
    mime_type: str
    file_size: int


def validate_file_upload(uploaded_file: UploadedFile) -> MediaValidationResult:
    extension = Path(uploaded_file.name).suffix.lower()
    guessed_mime_type = mimetypes.guess_type(uploaded_file.name)[0]
    mime_type = uploaded_file.content_type or guessed_mime_type or "application/octet-stream"
    allowed_extensions = set(
        getattr(settings, "MEDIA_ALLOWED_EXTENSIONS", DEFAULT_ALLOWED_EXTENSIONS)
    )
    allowed_mime_types = set(
        getattr(settings, "MEDIA_ALLOWED_MIME_TYPES", DEFAULT_ALLOWED_MIME_TYPES)
    )
    max_size = int(getattr(settings, "MEDIA_MAX_UPLOAD_SIZE", 10 * 1024 * 1024))

    if extension not in allowed_extensions:
        raise ValidationError(f"File extension '{extension}' is not allowed.")
    if mime_type not in allowed_mime_types:
        raise ValidationError(f"Mime type '{mime_type}' is not allowed.")
    if uploaded_file.size > max_size:
        raise ValidationError("Uploaded file exceeds the maximum allowed size.")

    return MediaValidationResult(
        extension=extension.lstrip("."),
        mime_type=mime_type,
        file_size=uploaded_file.size,
    )


def validate_tags(value: Any) -> None:
    if value in (None, ""):
        return
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValidationError("Tags must be a list of strings.")
