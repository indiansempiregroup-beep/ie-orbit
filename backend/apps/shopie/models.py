from __future__ import annotations

from decimal import Decimal

from django.db import models

from apps.core.models import TenantModel
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
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_business_settings"

    def pets_enabled(self) -> bool:
        packs = self.enabled_packs or []
        return VerticalPack.PETS in packs or "pets" in packs


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
    medical_notes = models.TextField(blank=True)
    medical_records = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "shop_pets"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.customer_id})"
