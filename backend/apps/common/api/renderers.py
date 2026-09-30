from __future__ import annotations

from rest_framework.renderers import BaseRenderer


class BinaryExportRenderer(BaseRenderer):
    """
    Accepts a binary media type during content negotiation for export endpoints
    that return a Django ``HttpResponse`` themselves.

    Without matching renderers, clients that send ``Accept: text/csv`` or
    ``Accept: application/pdf`` get HTTP 406 before the view runs.
    """

    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None) -> bytes:
        if data is None:
            return b""
        if isinstance(data, bytes):
            return data
        if isinstance(data, str):
            return data.encode("utf-8")
        return str(data).encode("utf-8")


class CsvExportRenderer(BinaryExportRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"


class PdfExportRenderer(BinaryExportRenderer):
    media_type = "application/pdf"
    format = "pdf"
