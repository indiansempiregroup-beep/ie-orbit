from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urlparse

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer

from apps.common.api.responses import pagination_meta, success_response
from apps.common.pagination.cursor import StandardCursorPagination


def _cursor_from_link(link: str | None) -> str | None:
    if not link:
        return None
    values = parse_qs(urlparse(link).query).get("cursor")
    return values[0] if values else None


def paginated_list_response(
    request: Request,
    queryset: Any,
    serializer: type[BaseSerializer] | BaseSerializer,
    *,
    request_id: str | None = None,
    many: bool = True,
) -> Response:
    paginator = StandardCursorPagination()
    page = paginator.paginate_queryset(queryset, request, view=None)
    if page is None:
        page_size = paginator.get_page_size(request) or paginator.page_size
        limited = queryset[: min(page_size, paginator.max_page_size)]
        data = serializer(limited, many=many).data
        return success_response(data, request_id=request_id or getattr(request, "request_id", None))

    data = serializer(page, many=many).data
    return success_response(
        data,
        request_id=request_id or getattr(request, "request_id", None),
        meta=pagination_meta(
            next_cursor=_cursor_from_link(paginator.get_next_link()),
            previous_cursor=_cursor_from_link(paginator.get_previous_link()),
            page_size=paginator.get_page_size(request),
        ),
    )
