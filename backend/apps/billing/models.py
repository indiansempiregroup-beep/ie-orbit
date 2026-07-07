from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel, TenantModel
from apps.tenancy.managers import TenantAwareManager


class CheckoutSessionStatus(models.TextChoices):
    CREATED = "created", "Created"
    PAID = "paid", "Paid"
    FAILED = "failed", "Failed"
    EXPIRED = "expired", "Expired"


class WebhookEventStatus(models.TextChoices):
    RECEIVED = "received", "Received"
    PROCESSED = "processed", "Processed"
    FAILED = "failed", "Failed"
    IGNORED = "ignored", "Ignored"


class BillingCheckoutSession(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="billing_checkout_sessions",
    )
    product_code = models.SlugField(max_length=80)
    plan_code = models.SlugField(max_length=80)
    razorpay_order_id = models.CharField(max_length=120, unique=True)
    amount_paise = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(
        max_length=32,
        choices=CheckoutSessionStatus.choices,
        default=CheckoutSessionStatus.CREATED,
        db_index=True,
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "billing_checkout_sessions"
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["razorpay_order_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.razorpay_order_id} ({self.status})"


class BillingWebhookEvent(BaseModel):
    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.SET_NULL,
        related_name="billing_webhook_events",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, default="razorpay")
    external_event_id = models.CharField(max_length=120, unique=True)
    event_type = models.CharField(max_length=120, db_index=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=32,
        choices=WebhookEventStatus.choices,
        default=WebhookEventStatus.RECEIVED,
        db_index=True,
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        db_table = "billing_webhook_events"
        indexes = [
            models.Index(fields=["provider", "event_type", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.external_event_id}"
