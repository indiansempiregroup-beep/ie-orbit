from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from apps.notifications.models import Notification, NotificationTemplate


class NotificationRepository:
    def list_for_request(self, *, tenant: Any, user: Any) -> QuerySet[Notification]:
        queryset = Notification.objects.require_tenant(tenant).select_related("template", "booking")
        if getattr(user, "is_superuser", False):
            return queryset
        return queryset.filter(user_id=user.id)

    def list_templates(self, *, tenant: Any, business: Any) -> QuerySet[NotificationTemplate]:
        return NotificationTemplate.objects.require_tenant(tenant).filter(business=business)

    def search(self, *, tenant: Any, user: Any, query: str = "") -> QuerySet[Notification]:
        queryset = self.list_for_request(tenant=tenant, user=user)
        if query:
            queryset = queryset.filter(Q(subject__icontains=query) | Q(body__icontains=query))
        return queryset
