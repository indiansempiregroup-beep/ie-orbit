from __future__ import annotations

import hashlib
import re
from pathlib import Path
from uuid import uuid4

from django.core.files.uploadedfile import UploadedFile


def normalize_filename(filename: str) -> str:
    stem = Path(filename).stem.lower()
    extension = Path(filename).suffix.lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", stem).strip("-") or "file"
    return f"{normalized}{extension}"


def storage_filename(filename: str) -> str:
    normalized = normalize_filename(filename)
    return f"{uuid4().hex}-{normalized}"


def calculate_checksum(uploaded_file: UploadedFile) -> str:
    position = uploaded_file.tell() if hasattr(uploaded_file, "tell") else None
    digest = hashlib.sha256()
    for chunk in uploaded_file.chunks():
        digest.update(chunk)
    if position is not None:
        uploaded_file.seek(position)
    else:
        uploaded_file.seek(0)
    return digest.hexdigest()
