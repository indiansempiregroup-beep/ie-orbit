from __future__ import annotations

from dataclasses import dataclass

from django.core.files.uploadedfile import UploadedFile


@dataclass(frozen=True)
class VirusScanResult:
    clean: bool
    provider: str = "noop"
    details: str = ""


class VirusScanService:
    def scan(self, uploaded_file: UploadedFile) -> VirusScanResult:
        return VirusScanResult(clean=True)
