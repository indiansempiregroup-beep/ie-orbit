from __future__ import annotations

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

from apps.core.models import BaseModel, TenantModel
from apps.tenancy.managers import TenantAwareManager

hex_color_validator = RegexValidator(
    regex=r"^#(?:[0-9a-fA-F]{3}){1,2}$",
    message="Enter a valid hex color value.",
)


class TenantStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"
    ARCHIVED = "archived", "Archived"


class SubscriptionStatus(models.TextChoices):
    TRIALING = "trialing", "Trialing"
    ACTIVE = "active", "Active"
    PAST_DUE = "past_due", "Past Due"
    SUSPENDED = "suspended", "Suspended"
    CANCELED = "canceled", "Canceled"


class ThemeMode(models.TextChoices):
    SYSTEM = "system", "System"
    LIGHT = "light", "Light"
    DARK = "dark", "Dark"


class Tenant(BaseModel):
    slug = models.SlugField(max_length=120, unique=True)
    display_name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=32,
        choices=TenantStatus.choices,
        default=TenantStatus.ACTIVE,
        db_index=True,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="owned_tenants",
        null=True,
        blank=True,
    )
    timezone = models.CharField(max_length=64, default="UTC")
    currency = models.CharField(max_length=3, default="USD")
    language = models.CharField(max_length=16, default="en")
    country = models.CharField(max_length=120, blank=True)
    state = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=120, blank=True)
    logo = models.CharField(max_length=500, blank=True)
    favicon = models.CharField(max_length=500, blank=True)
    primary_color = models.CharField(
        max_length=16,
        default="#0F6CBD",
        validators=[hex_color_validator],
    )
    secondary_color = models.CharField(
        max_length=16,
        default="#111827",
        validators=[hex_color_validator],
    )
    brand_settings = models.JSONField(default=dict, blank=True)
    subscription_reference = models.CharField(max_length=120, blank=True, db_index=True)

    class Meta:
        db_table = "tenants"
        ordering = ["display_name"]
        indexes = [
            *BaseModel.Meta.indexes,
            models.Index(fields=["slug", "status"]),
            models.Index(fields=["owner", "status"]),
        ]

    def __str__(self) -> str:
        return self.display_name


class Organization(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    business_category = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    alternate_phone = models.CharField(max_length=32, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True)
    state = models.CharField(max_length=120, blank=True)
    postal_code = models.CharField(max_length=32, blank=True)
    country = models.CharField(max_length=120, blank=True)
    tax_identifier = models.CharField(max_length=80, blank=True)
    tax_registration_type = models.CharField(max_length=80, blank=True)
    website = models.URLField(blank=True)
    social_links = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "organizations"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["tenant"], name="uq_organization_tenant")]

    def __str__(self) -> str:
        return self.name


class Branding(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    app_name = models.CharField(max_length=120)
    logo = models.CharField(max_length=500, blank=True)
    dark_logo = models.CharField(max_length=500, blank=True)
    favicon = models.CharField(max_length=500, blank=True)
    primary_color = models.CharField(
        max_length=16,
        default="#0F6CBD",
        validators=[hex_color_validator],
    )
    secondary_color = models.CharField(
        max_length=16,
        default="#111827",
        validators=[hex_color_validator],
    )
    accent_color = models.CharField(max_length=16, blank=True, validators=[hex_color_validator])
    theme_mode = models.CharField(
        max_length=16,
        choices=ThemeMode.choices,
        default=ThemeMode.SYSTEM,
    )
    typography_settings = models.JSONField(default=dict, blank=True)
    brand_metadata = models.JSONField(default=dict, blank=True)
    white_label_enabled = models.BooleanField(default=False)

    class Meta(TenantModel.Meta):
        db_table = "branding"
        constraints = [models.UniqueConstraint(fields=["tenant"], name="uq_branding_tenant")]

    def __str__(self) -> str:
        return f"{self.tenant.slug} branding"


class SubscriptionPlan(BaseModel):
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    feature_flags = models.JSONField(default=dict, blank=True)
    limits = models.JSONField(default=dict, blank=True)
    is_public = models.BooleanField(default=True)

    class Meta:
        db_table = "subscription_plans"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Subscription(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.PROTECT,
        related_name="subscriptions",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=32,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.TRIALING,
        db_index=True,
    )
    trial_starts_at = models.DateTimeField(null=True, blank=True)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    current_period_starts_at = models.DateTimeField(null=True, blank=True)
    current_period_ends_at = models.DateTimeField(null=True, blank=True)
    renewal_date = models.DateField(null=True, blank=True)
    feature_flags = models.JSONField(default=dict, blank=True)
    limits = models.JSONField(default=dict, blank=True)
    external_reference = models.CharField(max_length=120, blank=True, db_index=True)

    class Meta(TenantModel.Meta):
        db_table = "subscriptions"
        constraints = [models.UniqueConstraint(fields=["tenant"], name="uq_subscription_tenant")]

    def __str__(self) -> str:
        return f"{self.tenant.slug} subscription"


class TenantSettings(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business_hours = models.JSONField(default=dict, blank=True)
    booking_preferences = models.JSONField(default=dict, blank=True)
    localization = models.JSONField(default=dict, blank=True)
    timezone = models.CharField(max_length=64, default="UTC")
    currency = models.CharField(max_length=3, default="USD")
    language = models.CharField(max_length=16, default="en")
    notification_defaults = models.JSONField(default=dict, blank=True)
    security_preferences = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "tenant_settings"
        constraints = [models.UniqueConstraint(fields=["tenant"], name="uq_tenant_settings_tenant")]

    def __str__(self) -> str:
        return f"{self.tenant.slug} settings"


class OrganizationSettings(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="settings",
    )
    business_hours = models.JSONField(default=dict, blank=True)
    booking_preferences = models.JSONField(default=dict, blank=True)
    localization = models.JSONField(default=dict, blank=True)
    timezone = models.CharField(max_length=64, default="UTC")
    currency = models.CharField(max_length=3, default="USD")
    language = models.CharField(max_length=16, default="en")
    notification_defaults = models.JSONField(default=dict, blank=True)
    security_preferences = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "organization_settings"

    def __str__(self) -> str:
        return f"{self.organization.name} settings"
