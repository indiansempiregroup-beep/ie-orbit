from __future__ import annotations

from django.db import models

from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class DomainEventStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PUBLISHED = "published", "Published"
    FAILED = "failed", "Failed"


class AuditLogEntry(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    actor_id = models.UUIDField(null=True, blank=True, db_index=True)
    action = models.CharField(max_length=120, db_index=True)
    resource_type = models.CharField(max_length=120, db_index=True)
    resource_id = models.CharField(max_length=120, blank=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "audit_log_entries"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "action", "created_at"]),
            models.Index(fields=["tenant", "resource_type", "resource_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.resource_type}:{self.resource_id}"


class DomainEvent(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    event_type = models.CharField(max_length=160, db_index=True)
    aggregate_type = models.CharField(max_length=120, db_index=True)
    aggregate_id = models.CharField(max_length=120, db_index=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=32,
        choices=DomainEventStatus.choices,
        default=DomainEventStatus.PENDING,
        db_index=True,
    )
    published_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "domain_events"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "event_type", "status"]),
            models.Index(fields=["tenant", "aggregate_type", "aggregate_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.event_type} ({self.status})"
