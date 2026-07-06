from __future__ import annotations

from typing import Any

from apps.authentication.models import SecurityAuditEvent, User


class SecurityAuditService:
    def record(
        self,
        *,
        event_type: str,
        user: User | None = None,
        ip_address: str | None = None,
        user_agent: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        SecurityAuditEvent.objects.create(
            user=user,
            event_type=event_type,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
        )
