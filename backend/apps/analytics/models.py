from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class PlatformUsageDaily(BaseModel):
    """Durable daily usage facts for platform sales, support, and ops.

    One row per calendar day × tenant × business × Orbit product. Metrics stay
    even if operational rows are later deleted. ``metrics`` holds the full
    datapoint bag so new counters can land without a migration.
    """

    day = models.DateField(db_index=True)
    tenant_id = models.UUIDField(db_index=True)
    tenant_slug = models.SlugField(max_length=120)
    tenant_name = models.CharField(max_length=255)
    business_id = models.UUIDField(db_index=True)
    business_code = models.SlugField(max_length=80)
    business_name = models.CharField(max_length=255)
    product_code = models.CharField(max_length=80, db_index=True)
    currency = models.CharField(max_length=3, default="INR")
    bookings = models.PositiveIntegerField(default=0)
    completed_bookings = models.PositiveIntegerField(default=0)
    cancelled_bookings = models.PositiveIntegerField(default=0)
    no_show_bookings = models.PositiveIntegerField(default=0)
    booking_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unique_booking_customers = models.PositiveIntegerField(default=0)
    orders = models.PositiveIntegerField(default=0)
    cancelled_orders = models.PositiveIntegerField(default=0)
    gmv = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    units_sold = models.DecimalField(max_digits=16, decimal_places=3, default=0)
    unique_shop_customers = models.PositiveIntegerField(default=0)
    returns = models.PositiveIntegerField(default=0)
    refund_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    new_customers = models.PositiveIntegerField(default=0)
    notifications_sent = models.PositiveIntegerField(default=0)
    tickets_opened = models.PositiveIntegerField(default=0)
    metrics = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "platform_usage_daily"
        ordering = ["-day", "tenant_name", "business_name", "product_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["day", "tenant_id", "business_id", "product_code"],
                name="uq_platform_usage_daily_grain",
            )
        ]
        indexes = [
            *BaseModel.Meta.indexes,
            models.Index(fields=["day", "product_code"]),
            models.Index(fields=["tenant_id", "day"]),
            models.Index(fields=["business_id", "day"]),
        ]

    def __str__(self) -> str:
        return f"{self.day} {self.tenant_slug} {self.business_code} {self.product_code}"


class PlatformCatalogDaily(BaseModel):
    """Smallest product grain: service (Appoint) or SKU (Mart) per day."""

    class ItemKind(models.TextChoices):
        SERVICE = "service", "Service"
        SKU = "sku", "SKU"

    day = models.DateField(db_index=True)
    tenant_id = models.UUIDField(db_index=True)
    tenant_name = models.CharField(max_length=255)
    business_id = models.UUIDField(db_index=True)
    business_name = models.CharField(max_length=255)
    product_code = models.CharField(max_length=80, db_index=True)
    item_kind = models.CharField(max_length=16, choices=ItemKind.choices, db_index=True)
    item_id = models.UUIDField(db_index=True)
    item_name = models.CharField(max_length=255)
    currency = models.CharField(max_length=3, default="INR")
    activity_count = models.PositiveIntegerField(default=0)
    units = models.DecimalField(max_digits=16, decimal_places=3, default=0)
    revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    metrics = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "platform_catalog_daily"
        ordering = ["-day", "-revenue"]
        constraints = [
            models.UniqueConstraint(
                fields=["day", "business_id", "item_kind", "item_id"],
                name="uq_platform_catalog_daily_item",
            )
        ]
        indexes = [
            *BaseModel.Meta.indexes,
            models.Index(fields=["day", "item_kind", "product_code"]),
            models.Index(fields=["tenant_id", "day"]),
        ]

    def __str__(self) -> str:
        return f"{self.day} {self.item_kind} {self.item_name}"
