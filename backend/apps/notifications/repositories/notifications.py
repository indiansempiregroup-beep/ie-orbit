from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from apps.notifications.constants import AUDIENCE_ADMIN, AUDIENCE_CUSTOMER
from apps.notifications.models import Notification, NotificationTemplate


def audience_filter(*, audience: str) -> Q:
    explicit = Q(metadata__audience=audience)
    if audience == AUDIENCE_ADMIN:
        legacy = Q(metadata__audience__isnull=True, template__code__endswith="_admin")
        return explicit | legacy
    if audience == AUDIENCE_CUSTOMER:
        legacy = Q(metadata__audience__isnull=True) & ~Q(template__code__endswith="_admin")
        return explicit | legacy
    return explicit


class NotificationRepository:
    def list_for_request(
        self,
        *,
        tenant: Any,
        user: Any,
        audience: str | None = None,
        business: Any | None = None,
    ) -> QuerySet[Notification]:
        queryset = Notification.objects.require_tenant(tenant).select_related("template", "booking")
        if business is not None:
            queryset = queryset.filter(business=business)
        if not getattr(user, "is_superuser", False):
            queryset = queryset.filter(user_id=user.id)
        if audience:
            queryset = queryset.filter(audience_filter(audience=audience))
        return queryset

    def list_templates(self, *, tenant: Any, business: Any) -> QuerySet[NotificationTemplate]:
        return NotificationTemplate.objects.require_tenant(tenant).filter(business=business)

    def search(
        self,
        *,
        tenant: Any,
        user: Any,
        query: str = "",
        audience: str | None = None,
        business: Any | None = None,
    ) -> QuerySet[Notification]:
        queryset = self.list_for_request(tenant=tenant, user=user, audience=audience, business=business)
        if query:
            queryset = queryset.filter(Q(subject__icontains=query) | Q(body__icontains=query))
        return queryset
