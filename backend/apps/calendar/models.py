from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class CalendarConnection(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="calendar_connections",
    )
    provider = models.CharField(max_length=80, default="google")
    account_email = models.EmailField(blank=True)
    access_token = models.TextField(blank=True)
    refresh_token = models.TextField(blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scope = models.CharField(max_length=255, blank=True)
    is_connected = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "calendar_connections"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "provider"],
                name="uq_calendar_connection_tenant_business_provider",
            )
        ]


class CalendarSelection(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="calendar_selections",
    )
    connection = models.ForeignKey(
        CalendarConnection,
        on_delete=models.CASCADE,
        related_name="selections",
    )
    calendar_id = models.CharField(max_length=255)
    calendar_name = models.CharField(max_length=160, blank=True)
    is_default = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "calendar_selections"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "calendar_id"],
                name="uq_calendar_selection_tenant_business_calendar",
            )
        ]
