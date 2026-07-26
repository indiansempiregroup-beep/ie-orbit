from __future__ import annotations

from decimal import Decimal

from django.db import models

from apps.core.models import TenantModel
from apps.services.validators import validate_tags
from apps.tenancy.managers import TenantAwareManager


class ServiceStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    ARCHIVED = "archived", "Archived"


class ServiceVisibility(models.TextChoices):
    PUBLIC = "public", "Public"
    PRIVATE = "private", "Private"
    HIDDEN = "hidden", "Hidden"


class GenderRestriction(models.TextChoices):
    ANY = "any", "Any"
    FEMALE = "female", "Female"
    MALE = "male", "Male"
    CUSTOM = "custom", "Custom"


class ServiceCategory(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="service_categories",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        related_name="children",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120)
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=ServiceStatus.choices,
        default=ServiceStatus.ACTIVE,
        db_index=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "service_categories"
        ordering = ["display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "slug"],
                name="uq_service_category_tenant_business_slug",
            )
        ]

    def __str__(self) -> str:
        return self.name


class Service(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="services",
    )
    category = models.ForeignKey(
        ServiceCategory,
        on_delete=models.PROTECT,
        related_name="services",
        null=True,
        blank=True,
    )
    service_code = models.SlugField(max_length=80)
    name = models.CharField(max_length=160)
    display_name = models.CharField(max_length=160)
    short_description = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=32,
        choices=ServiceStatus.choices,
        default=ServiceStatus.ACTIVE,
        db_index=True,
    )
    visibility = models.CharField(
        max_length=32,
        choices=ServiceVisibility.choices,
        default=ServiceVisibility.PUBLIC,
        db_index=True,
    )
    online_booking_enabled = models.BooleanField(default=True, db_index=True)
    gender_restriction = models.CharField(
        max_length=32,
        choices=GenderRestriction.choices,
        default=GenderRestriction.ANY,
    )
    min_age = models.PositiveSmallIntegerField(null=True, blank=True)
    max_age = models.PositiveSmallIntegerField(null=True, blank=True)
    tags = models.JSONField(default=list, blank=True, validators=[validate_tags])
    display_order = models.PositiveIntegerField(default=0, db_index=True)
    loyalty_points_earn = models.PositiveIntegerField(default=0)
    addons_metadata = models.JSONField(default=dict, blank=True)
    packages_metadata = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "services"
        ordering = ["display_order", "display_name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "visibility"]),
            models.Index(fields=["tenant", "business", "service_code"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "service_code"],
                name="uq_service_tenant_business_code",
            )
        ]

    def __str__(self) -> str:
        return self.display_name


class ServiceVariant(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    sku = models.CharField(max_length=80, blank=True)
    status = models.CharField(
        max_length=32,
        choices=ServiceStatus.choices,
        default=ServiceStatus.ACTIVE,
        db_index=True,
    )
    display_order = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "service_variants"
        ordering = ["display_order", "name"]

    def __str__(self) -> str:
        return f"{self.service.display_name} - {self.name}"


class ServiceDuration(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="durations")
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.CASCADE,
        related_name="durations",
        null=True,
        blank=True,
    )
    duration_minutes = models.PositiveIntegerField(default=30)
    buffer_before_minutes = models.PositiveIntegerField(default=0)
    buffer_after_minutes = models.PositiveIntegerField(default=0)
    cleanup_minutes = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=True)

    class Meta(TenantModel.Meta):
        db_table = "service_durations"

    def __str__(self) -> str:
        return f"{self.service.display_name} {self.duration_minutes}m"


class ServicePricing(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="prices")
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.CASCADE,
        related_name="prices",
        null=True,
        blank=True,
    )
    currency = models.CharField(max_length=3, default="USD")
    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tax_inclusive = models.BooleanField(default=False)
    is_default = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "service_pricing"

    def __str__(self) -> str:
        return f"{self.service.display_name} {self.currency} {self.base_price}"


class TaxConfiguration(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="taxes")
    tax_name = models.CharField(max_length=80)
    tax_rate = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal("0.000"))
    tax_identifier = models.CharField(max_length=80, blank=True)
    is_active_tax = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "service_tax_configurations"

    def __str__(self) -> str:
        return f"{self.service.display_name} {self.tax_name}"


class ServiceImage(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="images")
    media = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.PROTECT,
        related_name="service_images",
    )
    alt_text = models.CharField(max_length=160, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)

    class Meta(TenantModel.Meta):
        db_table = "service_images"
        ordering = ["display_order", "created_at"]

    def __str__(self) -> str:
        return f"{self.service.display_name} image"


class ServiceTag(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="service_tags",
    )
    name = models.CharField(max_length=80)
    color = models.CharField(max_length=16, blank=True)
    description = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "service_tags"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "name"],
                name="uq_service_tag_tenant_business_name",
            )
        ]

    def __str__(self) -> str:
        return self.name
