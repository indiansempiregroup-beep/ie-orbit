from __future__ import annotations

from django.db import models

from apps.businesses.validators import validate_latitude, validate_longitude, validate_tags
from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class BusinessStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    SUSPENDED = "suspended", "Suspended"
    ARCHIVED = "archived", "Archived"


class BusinessVerificationStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING_VERIFICATION = "pending_verification", "Pending Verification"
    VERIFIED = "verified", "Verified"
    SUSPENDED = "suspended", "Suspended"
    ARCHIVED = "archived", "Archived"


class BusinessMediaType(models.TextChoices):
    LOGO = "logo", "Logo"
    BANNER = "banner", "Banner"
    GALLERY_IMAGE = "gallery_image", "Gallery Image"
    DOCUMENT = "document", "Document"
    CERTIFICATE = "certificate", "Certificate"


class BusinessProductSubscriptionStatus(models.TextChoices):
    TRIALING = "trialing", "Trialing"
    ACTIVE = "active", "Active"
    CANCELED = "canceled", "Canceled"


class BillingInterval(models.TextChoices):
    MONTHLY = "monthly", "Monthly"
    YEARLY = "yearly", "Yearly"


class BranchStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    ARCHIVED = "archived", "Archived"


class Business(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    organization = models.ForeignKey(
        "tenancy.Organization",
        on_delete=models.PROTECT,
        related_name="businesses",
    )
    business_code = models.SlugField(max_length=80)
    business_name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    business_type = models.CharField(max_length=120, blank=True)
    industry_category = models.CharField(max_length=120, blank=True, db_index=True)
    description = models.TextField(blank=True)
    logo = models.URLField(blank=True)
    banner_image = models.URLField(blank=True)
    primary_contact = models.CharField(max_length=32, blank=True)
    secondary_contact = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=120, blank=True, db_index=True)
    state = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=120, blank=True, db_index=True)
    postal_code = models.CharField(max_length=32, blank=True)
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[validate_latitude],
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[validate_longitude],
    )
    timezone = models.CharField(max_length=64, default="UTC")
    currency = models.CharField(max_length=3, default="USD")
    language = models.CharField(max_length=16, default="en")
    gst_tax_number = models.CharField(max_length=80, blank=True)
    registration_number = models.CharField(max_length=80, blank=True)
    status = models.CharField(
        max_length=32,
        choices=BusinessStatus.choices,
        default=BusinessStatus.ACTIVE,
        db_index=True,
    )
    verification_status = models.CharField(
        max_length=32,
        choices=BusinessVerificationStatus.choices,
        default=BusinessVerificationStatus.DRAFT,
        db_index=True,
    )
    tags = models.JSONField(default=list, blank=True, validators=[validate_tags])
    selected_product = models.CharField(max_length=80, blank=True, db_index=True)

    class Meta(TenantModel.Meta):
        db_table = "businesses"
        ordering = ["display_name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business_code"]),
            models.Index(fields=["tenant", "status", "verification_status"]),
            models.Index(fields=["tenant", "industry_category", "city"]),
            models.Index(fields=["tenant", "country", "city"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business_code"],
                name="uq_business_tenant_code",
            )
        ]

    def __str__(self) -> str:
        return self.display_name


class BusinessProductSubscription(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name="product_subscriptions",
    )
    product_code = models.CharField(max_length=80, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=BusinessProductSubscriptionStatus.choices,
        default=BusinessProductSubscriptionStatus.TRIALING,
        db_index=True,
    )
    subscribed_at = models.DateTimeField(auto_now_add=True)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    plan = models.ForeignKey(
        "tenancy.SubscriptionPlan",
        on_delete=models.SET_NULL,
        related_name="business_product_subscriptions",
        null=True,
        blank=True,
    )
    billing_interval = models.CharField(
        max_length=16,
        choices=BillingInterval.choices,
        default=BillingInterval.MONTHLY,
    )
    current_period_starts_at = models.DateTimeField(null=True, blank=True)
    current_period_ends_at = models.DateTimeField(null=True, blank=True)
    external_billing_reference = models.CharField(max_length=120, blank=True, db_index=True)

    class Meta(TenantModel.Meta):
        db_table = "business_product_subscriptions"
        ordering = ["subscribed_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["business", "product_code"]),
            models.Index(fields=["business", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["business", "product_code"],
                name="uq_business_product_subscription",
            )
        ]

    def __str__(self) -> str:
        return f"{self.business.display_name} · {self.product_code}"


class BusinessProfile(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.OneToOneField(Business, on_delete=models.CASCADE, related_name="profile")
    mission = models.TextField(blank=True)
    vision = models.TextField(blank=True)
    about = models.TextField(blank=True)
    working_days = models.JSONField(default=list, blank=True)
    opening_time = models.TimeField(null=True, blank=True)
    closing_time = models.TimeField(null=True, blank=True)
    break_hours = models.JSONField(default=list, blank=True)
    emergency_contact = models.CharField(max_length=32, blank=True)
    booking_lead_time = models.PositiveIntegerField(default=0)
    booking_window = models.PositiveIntegerField(default=30)
    cancellation_policy = models.TextField(blank=True)
    rescheduling_policy = models.TextField(blank=True)
    social_media_links = models.JSONField(default=dict, blank=True)
    seo_metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "business_profiles"

    def __str__(self) -> str:
        return f"{self.business.display_name} profile"


class BusinessSettings(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.OneToOneField(Business, on_delete=models.CASCADE, related_name="settings")
    booking_settings = models.JSONField(default=dict, blank=True)
    appointment_duration_defaults = models.JSONField(default=dict, blank=True)
    buffer_time = models.PositiveIntegerField(default=0)
    business_hours = models.JSONField(default=dict, blank=True)
    holiday_handling = models.JSONField(default=dict, blank=True)
    time_slot_interval = models.PositiveIntegerField(default=15)
    notification_preferences = models.JSONField(default=dict, blank=True)
    invoice_preferences = models.JSONField(default=dict, blank=True)
    localization = models.JSONField(default=dict, blank=True)
    theme_overrides = models.JSONField(default=dict, blank=True)
    dashboard_preferences = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "business_settings"

    def __str__(self) -> str:
        return f"{self.business.display_name} settings"


class Branch(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="branches")
    branch_code = models.SlugField(max_length=80)
    branch_name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    is_primary = models.BooleanField(default=False, db_index=True)
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True, db_index=True)
    state = models.CharField(max_length=120, blank=True)
    country = models.CharField(max_length=120, blank=True, db_index=True)
    postal_code = models.CharField(max_length=32, blank=True)
    timezone = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=32,
        choices=BranchStatus.choices,
        default=BranchStatus.ACTIVE,
        db_index=True,
    )

    class Meta(TenantModel.Meta):
        db_table = "branches"
        ordering = ["display_name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "is_primary"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["business", "branch_code"],
                name="uq_branch_business_code",
            )
        ]

    def __str__(self) -> str:
        return self.display_name


class BusinessMedia(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="media")
    media_type = models.CharField(
        max_length=32,
        choices=BusinessMediaType.choices,
        db_index=True,
    )
    title = models.CharField(max_length=160, blank=True)
    file_url = models.URLField()
    storage_backend = models.CharField(max_length=80, default="url")
    mime_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveBigIntegerField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "business_media"
        ordering = ["sort_order", "created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "media_type"]),
        ]

    def __str__(self) -> str:
        return self.title or f"{self.business.display_name} {self.media_type}"
