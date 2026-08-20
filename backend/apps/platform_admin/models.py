from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, TenantModel


class PlatformFeatureFlag(TenantModel):
    """Per-tenant product/module toggles managed by platform admins."""

    key = models.SlugField(max_length=80)
    enabled = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "platform_feature_flags"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "key"], name="uq_platform_feature_flag_tenant_key"),
        ]


class PlatformCreditLedger(TenantModel):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="platform_credits",
        null=True,
        blank=True,
    )
    amount_paise = models.IntegerField(help_text="Positive grant, negative consume")
    reason = models.CharField(max_length=255)
    balance_after_paise = models.IntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_credit_entries",
    )

    class Meta(TenantModel.Meta):
        db_table = "platform_credit_ledger"
        ordering = ["-created_at"]


class PlatformCoupon(BaseModel):
    code = models.SlugField(max_length=40, unique=True)
    percent_off = models.PositiveSmallIntegerField(null=True, blank=True)
    amount_off_paise = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    max_redemptions = models.PositiveIntegerField(null=True, blank=True)
    redemption_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_coupons"
        ordering = ["code"]


class PlatformPlanPackage(BaseModel):
    """Platform-managed plan package definitions, overriding PRODUCT_PLAN_CATALOG."""

    product_code = models.SlugField(max_length=40, db_index=True)
    code = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    billing_interval = models.CharField(max_length=16, default="monthly")
    trial_days = models.PositiveIntegerField(default=15)
    is_default = models.BooleanField(default=False)
    max_staff = models.PositiveIntegerField(default=1)
    max_branches = models.PositiveIntegerField(default=1)
    bi_features = models.JSONField(default=list, blank=True)
    features = models.JSONField(default=list, blank=True)
    amount_paise = models.PositiveIntegerField(default=0)
    yearly_amount_paise = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_plan_packages"
        ordering = ["product_code", "sort_order", "code"]

    def __str__(self) -> str:  # pragma: no cover - debug helper
        return self.code


class PlatformAddonPricing(BaseModel):
    """Singleton platform add-on unit prices (staff, office, pets pack)."""

    key = models.SlugField(max_length=20, unique=True, default="default")
    staff_price_paise = models.PositiveIntegerField(default=19900)
    office_price_paise = models.PositiveIntegerField(default=29900)
    pets_price_paise = models.PositiveIntegerField(default=50000)

    class Meta:
        db_table = "platform_addon_pricing"

    def __str__(self) -> str:  # pragma: no cover - debug helper
        return self.key


class PlatformCouponRedemption(TenantModel):
    coupon = models.ForeignKey(PlatformCoupon, on_delete=models.CASCADE, related_name="redemptions")
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="coupon_redemptions",
    )

    class Meta(TenantModel.Meta):
        db_table = "platform_coupon_redemptions"


class PlatformLedgerInvoice(TenantModel):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="ledger_invoices",
    )
    invoice_number = models.CharField(max_length=40, db_index=True)
    amount_paise = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=32, default="open", db_index=True)
    line_items = models.JSONField(default=list, blank=True)
    checkout_session = models.ForeignKey(
        "billing.BillingCheckoutSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_invoices",
    )
    razorpay_payment_id = models.CharField(max_length=120, blank=True)
    refunded_paise = models.PositiveIntegerField(default=0)
    pdf_path = models.CharField(max_length=512, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "platform_ledger_invoices"
        ordering = ["-created_at"]


class SupportTicket(TenantModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PENDING = "pending", "Pending"
        RESOLVED = "resolved", "Resolved"

    subject = models.CharField(max_length=255)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.OPEN, db_index=True)
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_tickets",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_support_tickets",
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_tickets",
    )

    class Meta(TenantModel.Meta):
        db_table = "platform_support_tickets"
        ordering = ["-created_at"]


class SupportTicketNote(BaseModel):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_ticket_notes",
    )
    body = models.TextField()
    is_internal = models.BooleanField(default=True)

    class Meta:
        db_table = "platform_support_ticket_notes"
        ordering = ["created_at"]


class PlatformAnnouncement(BaseModel):
    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        CRITICAL = "critical", "Critical"

    title = models.CharField(max_length=160)
    message = models.TextField()
    severity = models.CharField(max_length=32, choices=Severity.choices, default=Severity.INFO)
    is_active = models.BooleanField(default=True, db_index=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "platform_announcements"
        ordering = ["-created_at"]


class HelpArticle(BaseModel):
    slug = models.SlugField(max_length=160, unique=True)
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=80, blank=True, db_index=True)
    body = models.TextField()
    is_published = models.BooleanField(default=False, db_index=True)
    keywords = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "platform_help_articles"
        ordering = ["title"]


class PlatformAuditEvent(BaseModel):
    """Platform-wide audit that does not require a tenant FK."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_audit_events",
    )
    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_audit_events",
    )
    action = models.CharField(max_length=120, db_index=True)
    resource_type = models.CharField(max_length=80)
    resource_id = models.CharField(max_length=80, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)

    class Meta:
        db_table = "platform_audit_events"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action", "created_at"]),
            models.Index(fields=["tenant", "created_at"]),
        ]


class PlatformAffiliateType(models.TextChoices):
    TENANT = "tenant", "Tenant"
    PARTNER = "partner", "Partner"


class PlatformAffiliateStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    DISABLED = "disabled", "Disabled"
    INACTIVE = "inactive", "Inactive"


class PlatformReferralStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    EXPIRED = "expired", "Expired"
    VOID = "void", "Void"


class PlatformAccrualBenefitType(models.TextChoices):
    CREDIT = "credit", "Credit"
    PAYOUT = "payout", "Payout"


class PlatformAccrualStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    CREDITED = "credited", "Credited"
    PAID = "paid", "Paid"
    VOID = "void", "Void"


class PlatformPayoutStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"
    VOID = "void", "Void"


class PlatformAffiliateLedgerKind(models.TextChoices):
    EARNING = "earning", "Earning"
    PAYMENT = "payment", "Payment"
    CREDIT = "credit", "Subscription credit"


class PlatformAffiliateLedgerStatus(models.TextChoices):
    RECORDED = "recorded", "Recorded"
    VOID = "void", "Void"


class PlatformAffiliateCommissionTrigger(models.TextChoices):
    FIRST_PAYMENT = "first_payment", "First installment"
    EVERY_PAYMENT = "every_payment", "Every installment"
    NONE = "none", "Manual only"


class PlatformAffiliateCommissionType(models.TextChoices):
    FLAT = "flat", "Fixed amount"
    PERCENT = "percent", "Percentage of payment"


class PlatformAffiliate(BaseModel):
    affiliate_type = models.CharField(
        max_length=16,
        choices=PlatformAffiliateType.choices,
        default=PlatformAffiliateType.PARTNER,
        db_index=True,
    )
    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_affiliates",
    )
    name = models.CharField(max_length=160)
    email = models.EmailField(db_index=True)
    status = models.CharField(
        max_length=16,
        choices=PlatformAffiliateStatus.choices,
        default=PlatformAffiliateStatus.ACTIVE,
        db_index=True,
    )
    payout_method = models.CharField(max_length=16, blank=True, default="")
    upi_vpa = models.CharField(max_length=120, blank=True, default="")
    bank_account_name = models.CharField(max_length=160, blank=True, default="")
    bank_account_number = models.CharField(max_length=64, blank=True, default="")
    bank_ifsc = models.CharField(max_length=32, blank=True, default="")
    payout_notes = models.TextField(blank=True, default="")
    default_commission_paise = models.PositiveIntegerField(default=0)
    commission_trigger = models.CharField(
        max_length=24,
        choices=PlatformAffiliateCommissionTrigger.choices,
        default=PlatformAffiliateCommissionTrigger.FIRST_PAYMENT,
        db_index=True,
    )
    commission_type = models.CharField(
        max_length=16,
        choices=PlatformAffiliateCommissionType.choices,
        default=PlatformAffiliateCommissionType.FLAT,
    )
    commission_percent = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_affiliates"
        ordering = ["name"]


class PlatformAffiliateCode(BaseModel):
    affiliate = models.ForeignKey(
        PlatformAffiliate,
        on_delete=models.CASCADE,
        related_name="codes",
    )
    code = models.SlugField(max_length=40, unique=True)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_affiliate_codes"
        ordering = ["code"]


class PlatformReferral(BaseModel):
    affiliate = models.ForeignKey(
        PlatformAffiliate,
        on_delete=models.CASCADE,
        related_name="referrals",
    )
    referred_tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.CASCADE,
        related_name="platform_referrals_received",
    )
    affiliate_code = models.ForeignKey(
        PlatformAffiliateCode,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals",
    )
    starts_at = models.DateTimeField(db_index=True)
    months = models.PositiveSmallIntegerField(default=12)
    status = models.CharField(
        max_length=16,
        choices=PlatformReferralStatus.choices,
        default=PlatformReferralStatus.ACTIVE,
        db_index=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_referrals"
        ordering = ["-starts_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["referred_tenant"],
                name="uq_platform_referral_referred_tenant",
            ),
        ]


class PlatformReferralAccrual(BaseModel):
    referral = models.ForeignKey(
        PlatformReferral,
        on_delete=models.CASCADE,
        related_name="accruals",
    )
    period_yyyy_mm = models.CharField(max_length=7, db_index=True)
    amount_paise = models.PositiveIntegerField()
    benefit_type = models.CharField(
        max_length=16,
        choices=PlatformAccrualBenefitType.choices,
        default=PlatformAccrualBenefitType.CREDIT,
    )
    status = models.CharField(
        max_length=16,
        choices=PlatformAccrualStatus.choices,
        default=PlatformAccrualStatus.PENDING,
        db_index=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_referral_accruals"
        ordering = ["-period_yyyy_mm", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["referral", "period_yyyy_mm"],
                name="uq_platform_referral_accrual_period",
            ),
        ]


class PlatformPayout(BaseModel):
    affiliate = models.ForeignKey(
        PlatformAffiliate,
        on_delete=models.CASCADE,
        related_name="payouts",
    )
    amount_paise = models.PositiveIntegerField()
    status = models.CharField(
        max_length=16,
        choices=PlatformPayoutStatus.choices,
        default=PlatformPayoutStatus.PENDING,
        db_index=True,
    )
    payment_ref = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    accrual = models.ForeignKey(
        PlatformReferralAccrual,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payouts",
    )

    class Meta:
        db_table = "platform_payouts"
        ordering = ["-created_at"]


class PlatformAffiliateLedgerEntry(BaseModel):
    affiliate = models.ForeignKey(
        PlatformAffiliate,
        on_delete=models.CASCADE,
        related_name="ledger_entries",
    )
    referral = models.ForeignKey(
        PlatformReferral,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    kind = models.CharField(
        max_length=16,
        choices=PlatformAffiliateLedgerKind.choices,
        db_index=True,
    )
    amount_paise = models.PositiveIntegerField()
    period_yyyy_mm = models.CharField(max_length=7, blank=True, default="")
    payment_ref = models.CharField(max_length=120, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=16,
        choices=PlatformAffiliateLedgerStatus.choices,
        default=PlatformAffiliateLedgerStatus.RECORDED,
        db_index=True,
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_affiliate_ledger_entries",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_affiliate_ledger"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["affiliate", "kind", "status"]),
            models.Index(fields=["referral", "kind", "status"]),
        ]
