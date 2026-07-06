from __future__ import annotations

from collections import OrderedDict

from rest_framework.pagination import CursorPagination
from rest_framework.response import Response


class StandardCursorPagination(CursorPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"

    def get_paginated_response(self, data: list[object]) -> Response:
        return Response(
            OrderedDict(
                [
                    ("data", data),
                    (
                        "meta",
                        {
                            "pagination": {
                                "next": self.get_next_link(),
                                "previous": self.get_previous_link(),
                                "page_size": self.get_page_size(self.request),
                            }
                        },
                    ),
                ]
            )
        )
