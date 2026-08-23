from __future__ import annotations

from decimal import Decimal

from django.db import models

from apps.businesses.validators import validate_latitude, validate_longitude
from apps.core.models import BaseModel, TenantModel
from apps.tenancy.managers import TenantAwareManager


class BarcodeType(models.TextChoices):
    MANUFACTURER = "manufacturer", "Manufacturer"
    INTERNAL = "internal", "Internal"
    RFID_EPC = "rfid_epc", "RFID EPC"


class ProductStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    ARCHIVED = "archived", "Archived"


class ProductCategory(models.TextChoices):
    FOOD_GROCERY = "food_grocery", "Food & grocery"
    BEVERAGES = "beverages", "Beverages"
    SNACKS = "snacks", "Snacks & confectionery"
    DAIRY = "dairy", "Dairy"
    PERSONAL_CARE = "personal_care", "Personal care"
    HOUSEHOLD = "household", "Household"
    PET_FOOD = "pet_food", "Pet food"
    PET_SUPPLIES = "pet_supplies", "Pet supplies"
    BABY_CARE = "baby_care", "Baby care"
    HEALTH = "health", "Health & wellness"
    ELECTRONICS = "electronics", "Electronics & accessories"
    APPAREL = "apparel", "Apparel"
    OTHER = "other", "Other"


class OrderStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    READY = "ready", "Ready"
    OUT_FOR_DELIVERY = "out_for_delivery", "Out for Delivery"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class FulfillmentMode(models.TextChoices):
    PICKUP = "pickup", "Pickup"
    DELIVERY = "delivery", "Delivery"
    POS = "pos", "Point of Sale"


class DiscountType(models.TextChoices):
    PERCENT = "percent", "Percent"
    AMOUNT = "amount", "Fixed amount"


class InvoiceStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ISSUED = "issued", "Issued"
    PARTIALLY_PAID = "partially_paid", "Partially Paid"
    PAID = "paid", "Paid"
    CREDIT = "credit", "Credit Note"
    VOID = "void", "Void"


class QuotationStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SENT = "sent", "Sent"
    ACCEPTED = "accepted", "Accepted"
    REJECTED = "rejected", "Rejected"
    CONVERTED = "converted", "Converted"
    EXPIRED = "expired", "Expired"


class BooksDocumentType(models.TextChoices):
    SALE_ORDER = "sale_order", "Sale Order"
    PURCHASE_ORDER = "purchase_order", "Purchase Order"
    DELIVERY_CHALLAN = "delivery_challan", "Delivery Challan"
    JOB_WORK = "job_work", "Job Work"


class BooksDocumentStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    CONFIRMED = "confirmed", "Confirmed"
    CONVERTED = "converted", "Converted"
    CANCELLED = "cancelled", "Cancelled"
    DISPATCHED = "dispatched", "Dispatched"


class ChequeDirection(models.TextChoices):
    IN = "in", "Cheque In"
    OUT = "out", "Cheque Out"


class ChequeStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CLEARED = "cleared", "Cleared"
    BOUNCED = "bounced", "Bounced"
    CANCELLED = "cancelled", "Cancelled"


class LoanStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    CLOSED = "closed", "Closed"
    WRITTEN_OFF = "written_off", "Written off"


class StockMovementType(models.TextChoices):
    RECEIVE = "receive", "Receive"
    ADJUST = "adjust", "Adjust"
    SALE = "sale", "Sale"
    RETURN = "return", "Return"
    DAMAGE = "damage", "Damage"


class ReturnStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    COMPLETED = "completed", "Completed"
    REJECTED = "rejected", "Rejected"


class VerticalPack(models.TextChoices):
    PETS = "pets", "Pets"


class CashAccountType(models.TextChoices):
    CASH = "cash", "Cash"
    BANK = "bank", "Bank"


class VoucherType(models.TextChoices):
    SALE = "sale", "Sale"
    PURCHASE = "purchase", "Purchase"
    PAYMENT_IN = "payment_in", "Payment In"
    PAYMENT_OUT = "payment_out", "Payment Out"
    CREDIT_NOTE = "credit_note", "Credit Note"
    DEBIT_NOTE = "debit_note", "Debit Note"
    EXPENSE = "expense", "Expense"
    OTHER_INCOME = "other_income", "Other Income"
    TRANSFER = "transfer", "Transfer"


class VoucherStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    CONFIRMED = "confirmed", "Confirmed"
    VOID = "void", "Void"


class PartyKind(models.TextChoices):
    CUSTOMER = "customer", "Customer"
    SUPPLIER = "supplier", "Supplier"


class LedgerEntryType(models.TextChoices):
    SALE = "sale", "Sale"
    PURCHASE = "purchase", "Purchase"
    PAYMENT_IN = "payment_in", "Payment In"
    PAYMENT_OUT = "payment_out", "Payment Out"
    CREDIT = "credit", "Credit"
    DEBIT = "debit", "Debit"
    ADJUSTMENT = "adjustment", "Adjustment"
    OPENING = "opening", "Opening"


class LedgerDirection(models.TextChoices):
    DEBIT = "debit", "Debit"
    CREDIT = "credit", "Credit"


class EInvoiceStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending"
    GENERATED = "generated", "Generated"
    CANCELLED = "cancelled", "Cancelled"
    FAILED = "failed", "Failed"


class EInvoiceDocType(models.TextChoices):
    INVOICE = "INV", "Tax Invoice"
    CREDIT_NOTE = "CRN", "Credit Note"
    DEBIT_NOTE = "DBN", "Debit Note"


class EWayBillStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    GENERATED = "generated", "Generated"
    CANCELLED = "cancelled", "Cancelled"
    FAILED = "failed", "Failed"


class EWaySupplyType(models.TextChoices):
    OUTWARD = "O", "Outward"
    INWARD = "I", "Inward"


class ShopProduct(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_products",
    )
    sku = models.CharField(max_length=64, blank=True, db_index=True)
    name = models.CharField(max_length=200)
    brand = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    details_html = models.TextField(blank=True)
    status = models.CharField(
        max_length=32,
        choices=ProductStatus.choices,
        default=ProductStatus.ACTIVE,
        db_index=True,
    )
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, blank=True)
    stock_on_hand = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    low_stock_threshold = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    pack_size = models.CharField(max_length=80, blank=True)
    image_url = models.CharField(max_length=1024, blank=True)
    category = models.CharField(
        max_length=64,
        choices=ProductCategory.choices,
        blank=True,
        default="",
        db_index=True,
    )
    # GST books fields (ShopIE books: suppliers/vouchers/reports). hsn_sac + gst_rate
    # drive tax computation there; tax_rate is kept for backward compatibility with
    # the existing POS/order flow and is kept in sync with gst_rate on save.
    hsn_sac = models.CharField(max_length=16, blank=True)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    batch_tracking_enabled = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_products"
        ordering = ["name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "name"]),
            models.Index(fields=["tenant", "business", "category"]),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        # gst_rate is the source of truth for the books/GST engine; tax_rate is kept
        # in sync for legacy POS/order code paths that only read/write tax_rate.
        if self.gst_rate:
            self.tax_rate = self.gst_rate
        elif self.tax_rate:
            self.gst_rate = self.tax_rate
        super().save(*args, **kwargs)


class ShopProductBarcode(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_product_barcodes",
    )
    product = models.ForeignKey(
        ShopProduct,
        on_delete=models.CASCADE,
        related_name="barcodes",
    )
    code = models.CharField(max_length=128)
    barcode_type = models.CharField(
        max_length=32,
        choices=BarcodeType.choices,
        default=BarcodeType.MANUFACTURER,
    )
    is_primary = models.BooleanField(default=False)

    class Meta(TenantModel.Meta):
        db_table = "shop_product_barcodes"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_shop_barcode_business_code_active",
            )
        ]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "code"]),
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.barcode_type})"


class ShopProductReview(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_product_reviews",
    )
    product = models.ForeignKey(
        ShopProduct,
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="shop_product_reviews",
    )
    rating = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=200, blank=True)
    comment = models.TextField(blank=True)
    verified_purchase = models.BooleanField(default=False)

    class Meta(TenantModel.Meta):
        db_table = "shop_product_reviews"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(rating__gte=1) & models.Q(rating__lte=5),
                name="ck_shop_product_review_rating_range",
            ),
            models.UniqueConstraint(
                fields=["tenant", "product", "customer"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_shop_product_review_customer_active",
            ),
        ]
        indexes = [
            models.Index(fields=["is_active", "deleted_at"], name="shop_produc_is_acti_rev1_idx"),
            models.Index(fields=["created_at"], name="shop_produc_created_rev1_idx"),
            models.Index(fields=["updated_at"], name="shop_produc_updated_rev1_idx"),
            models.Index(
                fields=["tenant", "is_active", "deleted_at"],
                name="shop_produc_tenant__rev1_idx",
            ),
            models.Index(fields=["tenant", "created_at"], name="shop_produc_tenant_c_rev1_idx"),
            models.Index(
                fields=["tenant", "business", "product"],
                name="shop_produc_tenant_b_rev1_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.rating}★ {self.product_id}"


class ShopOrder(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_orders",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_orders",
    )
    order_number = models.CharField(max_length=32, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
        db_index=True,
    )
    fulfillment_mode = models.CharField(
        max_length=32,
        choices=FulfillmentMode.choices,
        default=FulfillmentMode.PICKUP,
    )
    currency = models.CharField(max_length=3, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    delivery_address = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_orders"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "order_number"]),
        ]

    def __str__(self) -> str:
        return self.order_number


class ShopOrderLine(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_order_lines",
    )
    order = models.ForeignKey(ShopOrder, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(
        ShopProduct,
        on_delete=models.PROTECT,
        related_name="order_lines",
    )
    product_name = models.CharField(max_length=200)
    barcode_scanned = models.CharField(max_length=128, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1"))
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    discount_type = models.CharField(max_length=16, blank=True, default="")
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    line_subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    line_tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta(TenantModel.Meta):
        db_table = "shop_order_lines"
        ordering = ["created_at"]


class ShopStockMovement(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_stock_movements",
    )
    product = models.ForeignKey(
        ShopProduct,
        on_delete=models.CASCADE,
        related_name="stock_movements",
    )
    movement_type = models.CharField(max_length=32, choices=StockMovementType.choices)
    quantity_delta = models.DecimalField(max_digits=12, decimal_places=3)
    quantity_after = models.DecimalField(max_digits=12, decimal_places=3)
    reason = models.CharField(max_length=255, blank=True)
    order = models.ForeignKey(
        ShopOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_stock_movements"
        ordering = ["-created_at"]


class ShopInvoice(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_invoices",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_invoices",
    )
    order = models.ForeignKey(
        ShopOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    invoice_number = models.CharField(max_length=32, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=InvoiceStatus.choices,
        default=InvoiceStatus.DRAFT,
        db_index=True,
    )
    currency = models.CharField(max_length=3, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    line_items = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_invoices"
        ordering = ["-created_at"]


class ShopQuotation(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_quotations",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_quotations",
    )
    quotation_number = models.CharField(max_length=32, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=QuotationStatus.choices,
        default=QuotationStatus.DRAFT,
        db_index=True,
    )
    currency = models.CharField(max_length=3, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    line_items = models.JSONField(default=list, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    converted_order = models.ForeignKey(
        ShopOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_quotations",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_quotations"
        ordering = ["-created_at"]


def _default_gst_compliance() -> dict:
    return {
        "provider": "mock",
        "username": "",
        "password": "",
        "client_id": "",
        "client_secret": "",
        "base_url": "",
        "seller_legal_name": "",
        "seller_trade_name": "",
        "seller_addr1": "",
        "seller_addr2": "",
        "seller_loc": "",
        "seller_pin": "",
        "seller_state_code": "",
        "seller_phone": "",
        "seller_email": "",
    }


def _default_delivery_integration() -> dict:
    return {
        "provider": "mock",
        "credentials": {},
        "base_url": "",
        "webhook_secret": "",
        "charge_bearer": "customer",
        "free_delivery_min_order": "0",
        "merchant_absorb_cap": "0",
        "default_parcel_weight_kg": "1",
    }


class ShopBusinessSettings(TenantModel):
    """Per-business ShopIE settings (packs, default fulfillment, etc.)."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.OneToOneField(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_settings",
    )
    enabled_packs = models.JSONField(default=list, blank=True)
    default_fulfillment_mode = models.CharField(
        max_length=32,
        choices=FulfillmentMode.choices,
        default=FulfillmentMode.PICKUP,
    )
    same_day_delivery_enabled = models.BooleanField(default=False)
    instant_delivery_enabled = models.BooleanField(default=False)
    delivery_integration = models.JSONField(
        default=_default_delivery_integration,
        blank=True,
    )
    # Indian GST e-invoice (IRN) + e-way bill compliance toggles and GSP/portal config.
    einvoice_enabled = models.BooleanField(default=False)
    eway_enabled = models.BooleanField(default=False)
    gst_compliance = models.JSONField(default=_default_gst_compliance, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_business_settings"

    def pets_enabled(self) -> bool:
        packs = self.enabled_packs or []
        return VerticalPack.PETS in packs or "pets" in packs


class DeliveryWebhookStatus(models.TextChoices):
    RECEIVED = "received", "Received"
    PROCESSED = "processed", "Processed"
    FAILED = "failed", "Failed"
    IGNORED = "ignored", "Ignored"
    DEAD_LETTER = "dead_letter", "Dead Letter"


class ShopDeliveryWebhookEvent(BaseModel):
    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.SET_NULL,
        related_name="shop_delivery_webhook_events",
        null=True,
        blank=True,
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.SET_NULL,
        related_name="shop_delivery_webhook_events",
        null=True,
        blank=True,
    )
    order = models.ForeignKey(
        ShopOrder,
        on_delete=models.SET_NULL,
        related_name="delivery_webhook_events",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, db_index=True)
    external_event_id = models.CharField(max_length=160)
    event_type = models.CharField(max_length=120, blank=True, db_index=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=32,
        choices=DeliveryWebhookStatus.choices,
        default=DeliveryWebhookStatus.RECEIVED,
        db_index=True,
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    retry_count = models.PositiveSmallIntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "shop_delivery_webhook_events"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "external_event_id"],
                name="uq_shop_delivery_webhook_provider_event",
            )
        ]
        indexes = [
            *BaseModel.Meta.indexes,
            models.Index(fields=["provider", "event_type", "status"]),
        ]


class ShopDeliveryZone(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_delivery_zones",
    )
    name = models.CharField(max_length=120)
    enabled = models.BooleanField(default=True)
    # City/area matching (case-insensitive contains) and optional postal prefixes.
    cities = models.JSONField(default=list, blank=True)
    postal_prefixes = models.JSONField(default=list, blank=True)
    same_day = models.BooleanField(default=True)
    fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    min_order_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_delivery_zones"
        ordering = ["name"]


class ShopReturn(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_returns",
    )
    order = models.ForeignKey(
        ShopOrder,
        on_delete=models.CASCADE,
        related_name="returns",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_returns",
    )
    return_number = models.CharField(max_length=32, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=ReturnStatus.choices,
        default=ReturnStatus.PENDING,
        db_index=True,
    )
    reason = models.TextField(blank=True)
    restock = models.BooleanField(default=True)
    refund_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, blank=True)
    credit_invoice = models.ForeignKey(
        ShopInvoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_returns",
    )
    line_items = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_returns"
        ordering = ["-created_at"]


class ShopPet(TenantModel):
    """Optional Pets vertical pack — only used when pack enabled on business."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_pets",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="shop_pets",
    )
    name = models.CharField(max_length=120)
    species = models.CharField(max_length=80, blank=True)
    breed = models.CharField(max_length=120, blank=True)
    sex = models.CharField(max_length=32, blank=True)
    birthday = models.DateField(null=True, blank=True)
    photo_url = models.CharField(max_length=1024, blank=True)
    medical_notes = models.TextField(blank=True)
    medical_records = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_pets"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.customer_id})"


class ShopSupplier(TenantModel):
    """Vendor/supplier for ShopIE books (purchases, payments out)."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_suppliers",
    )
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=32, blank=True, db_index=True)
    email = models.EmailField(blank=True, db_index=True)
    gstin = models.CharField(max_length=20, blank=True, db_index=True)
    billing_state = models.CharField(max_length=120, blank=True)
    billing_address = models.TextField(blank=True)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_suppliers"
        ordering = ["name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "name"]),
            models.Index(fields=["tenant", "business", "phone"]),
            models.Index(fields=["tenant", "business", "email"]),
            models.Index(fields=["tenant", "business", "gstin"]),
        ]

    def __str__(self) -> str:
        return self.name


class ShopCashAccount(TenantModel):
    """Cash-in-hand / bank account used to settle ShopIE books vouchers."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_cash_accounts",
    )
    name = models.CharField(max_length=120)
    account_type = models.CharField(
        max_length=16,
        choices=CashAccountType.choices,
        default=CashAccountType.CASH,
    )
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    current_balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_cash_accounts"
        ordering = ["name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "account_type"]),
            models.Index(fields=["tenant", "business", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.account_type})"


class ShopBooksVoucher(TenantModel):
    """Vyapar-style GST voucher: sale/purchase/payment/expense/transfer/etc."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_books_vouchers",
    )
    voucher_type = models.CharField(
        max_length=32,
        choices=VoucherType.choices,
        db_index=True,
    )
    voucher_number = models.CharField(max_length=32, db_index=True)
    voucher_date = models.DateField()
    status = models.CharField(
        max_length=16,
        choices=VoucherStatus.choices,
        default=VoucherStatus.CONFIRMED,
        db_index=True,
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_books_vouchers",
    )
    supplier = models.ForeignKey(
        ShopSupplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_books_vouchers",
    )
    cash_account = models.ForeignKey(
        ShopCashAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_books_vouchers",
    )
    contra_account = models.ForeignKey(
        ShopCashAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_books_vouchers_contra",
        help_text="Destination account for transfer vouchers.",
    )
    currency = models.CharField(max_length=3, blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    cgst_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    sgst_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    igst_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    place_of_supply = models.CharField(max_length=120, blank=True)
    is_interstate = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    line_items = models.JSONField(default=list, blank=True)
    linked_order = models.ForeignKey(
        ShopOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="books_vouchers",
    )
    linked_invoice = models.ForeignKey(
        ShopInvoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="books_vouchers",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_books_vouchers"
        ordering = ["-voucher_date", "-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "voucher_type"]),
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "voucher_date"]),
            models.Index(fields=["tenant", "business", "voucher_number"]),
            models.Index(fields=["tenant", "business", "customer"]),
            models.Index(fields=["tenant", "business", "supplier"]),
        ]

    def __str__(self) -> str:
        return f"{self.voucher_type}:{self.voucher_number}"


class ShopPartyLedgerEntry(TenantModel):
    """Running ledger of dues per customer/supplier, driven by books vouchers."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_party_ledger_entries",
    )
    party_kind = models.CharField(max_length=16, choices=PartyKind.choices, db_index=True)
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_party_ledger_entries",
    )
    supplier = models.ForeignKey(
        ShopSupplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_party_ledger_entries",
    )
    entry_type = models.CharField(max_length=16, choices=LedgerEntryType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    direction = models.CharField(max_length=8, choices=LedgerDirection.choices)
    balance_after = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    voucher = models.ForeignKey(
        ShopBooksVoucher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    notes = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_party_ledger_entries"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "party_kind"]),
            models.Index(fields=["tenant", "business", "customer"]),
            models.Index(fields=["tenant", "business", "supplier"]),
        ]

    def __str__(self) -> str:
        return f"{self.party_kind}:{self.entry_type}:{self.amount}"


class ShopProductBatch(TenantModel):
    """Optional batch / lot tracking for products with batch_tracking_enabled."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_product_batches",
    )
    product = models.ForeignKey(
        ShopProduct,
        on_delete=models.CASCADE,
        related_name="batches",
    )
    batch_number = models.CharField(max_length=64, db_index=True)
    serial_number = models.CharField(max_length=64, blank=True, db_index=True)
    manufactured_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    mrp = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_product_batches"
        ordering = ["expires_on", "batch_number"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "product"]),
            models.Index(fields=["tenant", "business", "batch_number"]),
            models.Index(fields=["tenant", "business", "expires_on"]),
        ]

    def __str__(self) -> str:
        return f"{self.batch_number} ({self.product_id})"


class ShopEInvoice(TenantModel):
    """GST e-invoice (IRN) generated against a ShopIE books voucher."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_einvoices",
    )
    voucher = models.OneToOneField(
        ShopBooksVoucher,
        on_delete=models.CASCADE,
        related_name="einvoice",
    )
    status = models.CharField(
        max_length=16,
        choices=EInvoiceStatus.choices,
        default=EInvoiceStatus.DRAFT,
        db_index=True,
    )
    doc_type = models.CharField(
        max_length=8,
        choices=EInvoiceDocType.choices,
        default=EInvoiceDocType.INVOICE,
    )
    irn = models.CharField(max_length=128, blank=True, db_index=True)
    ack_no = models.CharField(max_length=64, blank=True)
    ack_date = models.DateTimeField(null=True, blank=True)
    signed_qr = models.TextField(blank=True)
    signed_invoice = models.TextField(blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_einvoices"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "irn"]),
        ]

    def __str__(self) -> str:
        return f"EInvoice:{self.voucher_id}:{self.irn or self.status}"


class ShopEWayBill(TenantModel):
    """E-way bill generated for the movement of goods for a ShopIE books voucher."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_eway_bills",
    )
    voucher = models.ForeignKey(
        ShopBooksVoucher,
        on_delete=models.CASCADE,
        related_name="eway_bills",
    )
    einvoice = models.ForeignKey(
        ShopEInvoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="eway_bills",
    )
    status = models.CharField(
        max_length=16,
        choices=EWayBillStatus.choices,
        default=EWayBillStatus.DRAFT,
        db_index=True,
    )
    ewb_no = models.CharField(max_length=32, blank=True, db_index=True)
    ewb_date = models.DateTimeField(null=True, blank=True)
    valid_upto = models.DateTimeField(null=True, blank=True)
    supply_type = models.CharField(
        max_length=1,
        choices=EWaySupplyType.choices,
        default=EWaySupplyType.OUTWARD,
    )
    sub_supply_type = models.CharField(max_length=8, default="1")
    doc_type = models.CharField(max_length=8, default=EInvoiceDocType.INVOICE)
    transporter_id = models.CharField(max_length=20, blank=True)
    transporter_name = models.CharField(max_length=200, blank=True)
    transport_mode = models.CharField(max_length=4, default="1")
    vehicle_no = models.CharField(max_length=20, blank=True)
    vehicle_type = models.CharField(max_length=4, blank=True, default="R")
    distance_km = models.PositiveIntegerField(default=0)
    from_place = models.CharField(max_length=120, blank=True)
    from_state_code = models.CharField(max_length=2, blank=True)
    to_place = models.CharField(max_length=120, blank=True)
    to_state_code = models.CharField(max_length=2, blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_eway_bills"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "voucher"]),
            models.Index(fields=["tenant", "business", "ewb_no"]),
        ]

    def __str__(self) -> str:
        return f"EWayBill:{self.voucher_id}:{self.ewb_no or self.status}"


class ShopBooksDocument(TenantModel):
    """Non-posted books documents: sale/purchase orders, challan, job work."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_books_documents",
    )
    doc_type = models.CharField(max_length=32, choices=BooksDocumentType.choices, db_index=True)
    document_number = models.CharField(max_length=32, db_index=True)
    document_date = models.DateField()
    status = models.CharField(
        max_length=16,
        choices=BooksDocumentStatus.choices,
        default=BooksDocumentStatus.DRAFT,
        db_index=True,
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_books_documents",
    )
    supplier = models.ForeignKey(
        ShopSupplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_books_documents",
    )
    currency = models.CharField(max_length=3, blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    line_items = models.JSONField(default=list, blank=True)
    converted_voucher = models.ForeignKey(
        ShopBooksVoucher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_documents",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_books_documents"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "doc_type", "status"]),
        ]


class ShopGodown(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_godowns",
    )
    branch = models.ForeignKey(
        "businesses.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_godowns",
    )
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=32, blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True)
    state = models.CharField(max_length=120, blank=True)
    country = models.CharField(max_length=120, blank=True)
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
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_godowns"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "branch"],
                condition=models.Q(branch__isnull=False),
                name="uniq_shop_godown_per_branch",
            )
        ]


class ShopGodownStock(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_godown_stocks",
    )
    godown = models.ForeignKey(ShopGodown, on_delete=models.CASCADE, related_name="stocks")
    product = models.ForeignKey(ShopProduct, on_delete=models.CASCADE, related_name="godown_stocks")
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal("0.000"))

    class Meta(TenantModel.Meta):
        db_table = "shop_godown_stocks"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "godown", "product"],
                name="uniq_shop_godown_stock",
            )
        ]


class ShopStockTransfer(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_stock_transfers",
    )
    from_godown = models.ForeignKey(
        ShopGodown, on_delete=models.PROTECT, related_name="transfers_out"
    )
    to_godown = models.ForeignKey(
        ShopGodown, on_delete=models.PROTECT, related_name="transfers_in"
    )
    transfer_number = models.CharField(max_length=32, db_index=True)
    transfer_date = models.DateField()
    status = models.CharField(max_length=16, default="completed")
    notes = models.TextField(blank=True)
    line_items = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_stock_transfers"
        ordering = ["-created_at"]


class ShopCheque(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_cheques",
    )
    direction = models.CharField(max_length=8, choices=ChequeDirection.choices, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=ChequeStatus.choices,
        default=ChequeStatus.PENDING,
        db_index=True,
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_cheques",
    )
    supplier = models.ForeignKey(
        ShopSupplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_cheques",
    )
    cash_account = models.ForeignKey(
        ShopCashAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_cheques",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    cheque_number = models.CharField(max_length=64)
    bank_name = models.CharField(max_length=120, blank=True)
    due_date = models.DateField(null=True, blank=True)
    cleared_at = models.DateTimeField(null=True, blank=True)
    linked_voucher = models.ForeignKey(
        ShopBooksVoucher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_cheques",
    )
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_cheques"
        ordering = ["-created_at"]


class ShopLoan(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_loans",
    )
    party_kind = models.CharField(max_length=16, choices=PartyKind.choices, default=PartyKind.CUSTOMER)
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_loans",
    )
    supplier = models.ForeignKey(
        ShopSupplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_loans",
    )
    title = models.CharField(max_length=160)
    principal = models.DecimalField(max_digits=14, decimal_places=2)
    interest_rate = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal("0.00"))
    balance = models.DecimalField(max_digits=14, decimal_places=2)
    start_date = models.DateField()
    status = models.CharField(
        max_length=16,
        choices=LoanStatus.choices,
        default=LoanStatus.ACTIVE,
        db_index=True,
    )
    notes = models.TextField(blank=True)
    repayments = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_loans"
        ordering = ["-created_at"]


class ShopDashboardAd(TenantModel):
    """Promotional banners for the customer app (max 5 active per business)."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_dashboard_ads",
    )
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    media = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_dashboard_ads",
    )
    image_url = models.CharField(max_length=1024, blank=True)
    link_url = models.CharField(max_length=1024, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    starts_at = models.DateTimeField(null=True, blank=True, db_index=True)
    ends_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_dashboard_ads"
        ordering = ["sort_order", "-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "is_active", "sort_order"]),
        ]

    def __str__(self) -> str:
        return self.title


class CustomerReferralStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    QUALIFIED = "qualified", "Qualified"
    REWARDED = "rewarded", "Rewarded"
    VOID = "void", "Void"


class CustomerReferralCode(TenantModel):
    """Per-customer referral code unique within a business."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="customer_referral_codes",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="referral_codes",
    )
    code = models.SlugField(max_length=40)

    class Meta(TenantModel.Meta):
        db_table = "shop_customer_referral_codes"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "code"],
                name="uq_shop_customer_referral_code",
            ),
            models.UniqueConstraint(
                fields=["tenant", "business", "customer"],
                name="uq_shop_customer_referral_code_customer",
            ),
        ]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "code"]),
        ]

    def __str__(self) -> str:
        return self.code


class CustomerReferral(TenantModel):
    """Tracks a referred customer and reward lifecycle."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="customer_referrals",
    )
    referrer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="referrals_made",
    )
    referred = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="referrals_received",
    )
    status = models.CharField(
        max_length=16,
        choices=CustomerReferralStatus.choices,
        default=CustomerReferralStatus.PENDING,
        db_index=True,
    )
    rewarded_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_customer_referrals"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "referred"],
                name="uq_shop_customer_referral_referred",
            ),
        ]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "referrer"]),
        ]

    def __str__(self) -> str:
        return f"{self.referrer_id} → {self.referred_id} ({self.status})"


class ShopCoupon(TenantModel):
    """Promo code for online (pickup/delivery) shop orders."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_coupons",
    )
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    discount_type = models.CharField(
        max_length=16,
        choices=DiscountType.choices,
        default=DiscountType.PERCENT,
    )
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    min_order_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    max_discount_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    starts_at = models.DateTimeField(null=True, blank=True, db_index=True)
    ends_at = models.DateTimeField(null=True, blank=True, db_index=True)
    max_redemptions = models.PositiveIntegerField(null=True, blank=True)
    max_redemptions_per_customer = models.PositiveIntegerField(null=True, blank=True)
    first_order_only = models.BooleanField(default=False)
    redemption_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_coupons"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_shop_coupon_code_active",
            ),
        ]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "code"]),
            models.Index(fields=["tenant", "business", "is_active"]),
        ]

    def __str__(self) -> str:
        return self.code


class ShopCouponRedemption(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="shop_coupon_redemptions",
    )
    coupon = models.ForeignKey(ShopCoupon, on_delete=models.CASCADE, related_name="redemptions")
    order = models.OneToOneField(
        ShopOrder,
        on_delete=models.CASCADE,
        related_name="coupon_redemption",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_coupon_redemptions",
    )
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta(TenantModel.Meta):
        db_table = "shop_coupon_redemptions"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "coupon"]),
        ]

    def __str__(self) -> str:
        return f"{self.coupon_id}@{self.order_id}"
