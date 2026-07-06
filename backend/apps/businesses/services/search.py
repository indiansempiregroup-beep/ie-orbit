from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from apps.businesses.models import Business
from apps.businesses.repositories import BusinessRepository


class BusinessSearchService:
    def __init__(self, repository: BusinessRepository | None = None) -> None:
        self.repository = repository or BusinessRepository()

    def search(self, *, tenant: Any, user: Any, params: dict[str, Any]) -> QuerySet[Business]:
        tags = params.get("tags") or []
        if isinstance(tags, str):
            tags = [tag.strip() for tag in tags.split(",") if tag.strip()]
        return self.repository.search(
            tenant=tenant,
            user=user,
            query=str(params.get("q", "") or ""),
            category=str(params.get("category", "") or ""),
            city=str(params.get("city", "") or ""),
            country=str(params.get("country", "") or ""),
            status=str(params.get("status", "") or ""),
            tags=tags,
        )
