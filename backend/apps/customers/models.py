from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import TenantModel
from apps.customers.validators import validate_tags
from apps.tenancy.managers import TenantAwareManager


class CustomerStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    BLOCKED = "blocked", "Blocked"
    ARCHIVED = "archived", "Archived"
    MERGED = "merged", "Merged"


class CustomerGender(models.TextChoices):
    NOT_SPECIFIED = "not_specified", "Not Specified"
    FEMALE = "female", "Female"
    MALE = "male", "Male"
    NON_BINARY = "non_binary", "Non-binary"
    OTHER = "other", "Other"


class CustomerAddressType(models.TextChoices):
    HOME = "home", "Home"
    WORK = "work", "Work"
    BILLING = "billing", "Billing"
    OTHER = "other", "Other"


class CommunicationChannel(models.TextChoices):
    EMAIL = "email", "Email"
    SMS = "sms", "SMS"
    WHATSAPP = "whatsapp", "WhatsApp"
    PHONE = "phone", "Phone"
    PUSH = "push", "Push"


class CustomerJobStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    QUEUED = "queued", "Queued"
    PROCESSING = "processing", "Processing"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"


class Customer(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.PROTECT,
        related_name="customers",
    )
    customer_code = models.SlugField(max_length=80)
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120, blank=True)
    display_name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, db_index=True)
    phone_number = models.CharField(max_length=32, blank=True, db_index=True)
    alternate_phone = models.CharField(max_length=32, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(
        max_length=32,
        choices=CustomerGender.choices,
        default=CustomerGender.NOT_SPECIFIED,
    )
    source = models.CharField(max_length=80, blank=True)
    status = models.CharField(
        max_length=32,
        choices=CustomerStatus.choices,
        default=CustomerStatus.ACTIVE,
        db_index=True,
    )
    tags = models.JSONField(default=list, blank=True, validators=[validate_tags])
    merged_into = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        related_name="merged_customers",
        null=True,
        blank=True,
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    # ShopIE books: optional receivable credit limit (0 = no limit enforced).
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    billing_state = models.CharField(max_length=120, blank=True)
    gstin = models.CharField(max_length=20, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customers"
        ordering = ["display_name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "email"]),
            models.Index(fields=["tenant", "business", "phone_number"]),
            models.Index(fields=["tenant", "business", "customer_code"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "customer_code"],
                name="uq_customer_tenant_business_code",
            )
        ]

    def __str__(self) -> str:
        return self.display_name


class CustomerProfile(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name="profile")
    photo = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.SET_NULL,
        related_name="customer_profiles",
        null=True,
        blank=True,
    )
    occupation = models.CharField(max_length=120, blank=True)
    company = models.CharField(max_length=160, blank=True)
    about = models.TextField(blank=True)
    preferences_summary = models.TextField(blank=True)
    internal_reference = models.CharField(max_length=120, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_profiles"

    def __str__(self) -> str:
        return f"{self.customer.display_name} profile"


class CustomerAddress(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="addresses")
    address_type = models.CharField(
        max_length=32,
        choices=CustomerAddressType.choices,
        default=CustomerAddressType.HOME,
    )
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True, db_index=True)
    state = models.CharField(max_length=120, blank=True)
    country = models.CharField(max_length=120, blank=True, db_index=True)
    postal_code = models.CharField(max_length=32, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta(TenantModel.Meta):
        db_table = "customer_addresses"
        ordering = ["-is_default", "created_at"]

    def __str__(self) -> str:
        return f"{self.customer.display_name} {self.address_type}"


class CustomerPreferences(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name="preferences")
    timezone = models.CharField(max_length=64, default="UTC")
    currency = models.CharField(max_length=3, default="USD")
    language = models.CharField(max_length=16, default="en")
    booking_preferences = models.JSONField(default=dict, blank=True)
    communication_preferences = models.JSONField(default=dict, blank=True)
    marketing_opt_in = models.BooleanField(default=False)
    accessibility_preferences = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_preferences"

    def __str__(self) -> str:
        return f"{self.customer.display_name} preferences"


class CustomerCommunicationPreference(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="communication_channels",
    )
    channel = models.CharField(max_length=32, choices=CommunicationChannel.choices)
    is_enabled = models.BooleanField(default=True)
    opt_in_at = models.DateTimeField(null=True, blank=True)
    opt_out_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_communication_preferences"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "customer", "channel"],
                name="uq_customer_communication_channel",
            )
        ]

    def __str__(self) -> str:
        return f"{self.customer.display_name} {self.channel}"


class CustomerNote(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="notes")
    note = models.TextField()
    is_internal = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="customer_notes",
        null=True,
        blank=True,
    )

    class Meta(TenantModel.Meta):
        db_table = "customer_notes"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.customer.display_name} note"


class CustomerTag(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="customer_tags",
    )
    name = models.CharField(max_length=80)
    color = models.CharField(max_length=16, blank=True)
    description = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_tags"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "name"],
                name="uq_customer_tag_tenant_business_name",
            )
        ]

    def __str__(self) -> str:
        return self.name


class CustomerImportJob(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.PROTECT,
        related_name="customer_import_jobs",
    )
    source_media = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.SET_NULL,
        related_name="customer_import_jobs",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=32,
        choices=CustomerJobStatus.choices,
        default=CustomerJobStatus.DRAFT,
        db_index=True,
    )
    total_rows = models.PositiveIntegerField(default=0)
    processed_rows = models.PositiveIntegerField(default=0)
    failed_rows = models.PositiveIntegerField(default=0)
    mapping = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_import_jobs"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Customer import {self.id}"


class CustomerExportJob(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.PROTECT,
        related_name="customer_export_jobs",
    )
    result_media = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.SET_NULL,
        related_name="customer_export_jobs",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=32,
        choices=CustomerJobStatus.choices,
        default=CustomerJobStatus.DRAFT,
        db_index=True,
    )
    filters = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_export_jobs"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Customer export {self.id}"


class CustomerMergeRecord(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.PROTECT,
        related_name="customer_merge_records",
    )
    source_customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="merge_records_as_source",
    )
    target_customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="merge_records_as_target",
    )
    merged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="customer_merges",
        null=True,
        blank=True,
    )
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_merge_records"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.source_customer_id} into {self.target_customer_id}"


class CustomerLoyaltyAccount(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="loyalty_accounts",
    )
    customer = models.OneToOneField(
        Customer,
        on_delete=models.CASCADE,
        related_name="loyalty_account",
    )
    points_balance = models.PositiveIntegerField(default=0)

    class Meta(TenantModel.Meta):
        db_table = "customer_loyalty_accounts"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "customer"],
                name="uq_loyalty_account_tenant_business_customer",
            )
        ]

    def __str__(self) -> str:
        return f"{self.customer_id}: {self.points_balance} pts"


class CustomerLoyaltyLedger(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    account = models.ForeignKey(
        CustomerLoyaltyAccount,
        on_delete=models.CASCADE,
        related_name="ledger_entries",
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="loyalty_ledger_entries",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="loyalty_ledger_entries",
    )
    points_delta = models.IntegerField()
    reason = models.CharField(max_length=160)
    booking_id = models.UUIDField(null=True, blank=True, db_index=True)
    order_id = models.UUIDField(null=True, blank=True, db_index=True)
    voucher_id = models.UUIDField(null=True, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_loyalty_ledger"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.points_delta} ({self.reason})"


class BorrowLedgerEntryType(models.TextChoices):
    CHARGE = "charge", "Charge"
    PAYMENT = "payment", "Payment"
    ADJUSTMENT = "adjustment", "Adjustment"


class CustomerBorrowAccount(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="borrow_accounts",
    )
    customer = models.OneToOneField(
        Customer,
        on_delete=models.CASCADE,
        related_name="borrow_account",
    )
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_borrow_accounts"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "customer"],
                name="uq_borrow_account_tenant_business_customer",
            )
        ]

    def __str__(self) -> str:
        return f"{self.customer_id}: due {self.balance_due}"


class CustomerBorrowLedger(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    account = models.ForeignKey(
        CustomerBorrowAccount,
        on_delete=models.CASCADE,
        related_name="ledger_entries",
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="borrow_ledger_entries",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="borrow_ledger_entries",
    )
    entry_type = models.CharField(max_length=32, choices=BorrowLedgerEntryType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=32, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    order_id = models.UUIDField(null=True, blank=True, db_index=True)
    order_number = models.CharField(max_length=32, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "customer_borrow_ledger"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.entry_type} {self.amount}"
