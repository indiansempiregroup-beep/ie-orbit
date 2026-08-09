from __future__ import annotations

from rest_framework import serializers

from apps.shopie.models import (
    BarcodeType,
    CashAccountType,
    EWaySupplyType,
    FulfillmentMode,
    OrderStatus,
    PartyKind,
    ProductCategory,
    ProductStatus,
    ShopBooksDocument,
    ShopBooksVoucher,
    ShopBusinessSettings,
    ShopCashAccount,
    ShopCheque,
    ShopDeliveryZone,
    ShopEInvoice,
    ShopEWayBill,
    ShopGodown,
    ShopInvoice,
    ShopLoan,
    ShopOrder,
    ShopOrderLine,
    ShopPartyLedgerEntry,
    ShopPet,
    ShopProduct,
    ShopProductBarcode,
    ShopQuotation,
    ShopReturn,
    ShopStockMovement,
    ShopStockTransfer,
    ShopSupplier,
    VoucherStatus,
)


class ShopProductBarcodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopProductBarcode
        fields = ["id", "code", "barcode_type", "is_primary"]


class ShopProductSerializer(serializers.ModelSerializer):
    barcodes = ShopProductBarcodeSerializer(many=True, read_only=True)

    class Meta:
        model = ShopProduct
        fields = [
            "id",
            "business",
            "sku",
            "name",
            "brand",
            "description",
            "status",
            "price",
            "tax_rate",
            "hsn_sac",
            "gst_rate",
            "batch_tracking_enabled",
            "currency",
            "stock_on_hand",
            "low_stock_threshold",
            "pack_size",
            "image_url",
            "category",
            "metadata",
            "barcodes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ShopProductWriteSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    sku = serializers.CharField(required=False, allow_blank=True, max_length=64)
    name = serializers.CharField(max_length=200)
    brand = serializers.CharField(required=False, allow_blank=True, max_length=120)
    description = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=ProductStatus.choices, required=False)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    hsn_sac = serializers.CharField(required=False, allow_blank=True, max_length=16)
    gst_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    batch_tracking_enabled = serializers.BooleanField(required=False)
    currency = serializers.CharField(required=False, allow_blank=True, max_length=3)
    stock_on_hand = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    low_stock_threshold = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    pack_size = serializers.CharField(required=False, allow_blank=True, max_length=80)
    # Relative /media/... paths from local uploads are valid product images.
    image_url = serializers.CharField(required=False, allow_blank=True, max_length=1024)
    category = serializers.ChoiceField(
        choices=ProductCategory.choices,
        required=False,
        allow_blank=True,
    )
    metadata = serializers.DictField(required=False)
    barcodes = serializers.ListField(child=serializers.DictField(), required=False)


class ShopProductPatchSerializer(ShopProductWriteSerializer):
    name = serializers.CharField(max_length=200, required=False)
    business_id = serializers.UUIDField(required=False)


class BarcodeLookupSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    code = serializers.CharField(max_length=128)


class EnrichBarcodeSerializer(serializers.Serializer):
    code = serializers.CharField(required=False, allow_blank=True, max_length=128)
    query = serializers.CharField(required=False, allow_blank=True, max_length=200)
    image_url = serializers.URLField(required=False, allow_blank=True)
    hint = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate(self, attrs):
        code = (attrs.get("code") or "").strip()
        query = (attrs.get("query") or "").strip()
        image_url = (attrs.get("image_url") or "").strip()
        hint = (attrs.get("hint") or "").strip()
        if not code and not query and not image_url and not hint:
            raise serializers.ValidationError("Provide a barcode, search query, or product image.")
        return attrs


class PackagingAnalyzeSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    front_image_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    back_image_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    hint = serializers.CharField(required=False, allow_blank=True, max_length=200)
    async_mode = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        front = (attrs.get("front_image_url") or "").strip()
        back = (attrs.get("back_image_url") or "").strip()
        if not front and not back:
            raise serializers.ValidationError("Provide a front and/or back packaging image URL.")
        return attrs


class StockAdjustSerializer(serializers.Serializer):
    quantity_delta = serializers.DecimalField(max_digits=12, decimal_places=3)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
    movement_type = serializers.CharField(required=False, allow_blank=True, max_length=32)


class ShopOrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopOrderLine
        fields = [
            "id",
            "product",
            "product_name",
            "barcode_scanned",
            "quantity",
            "unit_price",
            "tax_rate",
            "discount_type",
            "discount_value",
            "discount_amount",
            "line_subtotal",
            "line_tax",
            "line_total",
        ]


class ShopOrderSerializer(serializers.ModelSerializer):
    lines = ShopOrderLineSerializer(many=True, read_only=True)
    customer_id = serializers.UUIDField(source="customer.id", read_only=True, allow_null=True)
    payment_method = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    upi_utr = serializers.SerializerMethodField()
    payment_proof_url = serializers.SerializerMethodField()
    upi_pay_url = serializers.SerializerMethodField()
    delivery_fee = serializers.SerializerMethodField()

    class Meta:
        model = ShopOrder
        fields = [
            "id",
            "business",
            "customer_id",
            "order_number",
            "status",
            "fulfillment_mode",
            "currency",
            "subtotal",
            "discount_total",
            "tax_total",
            "total",
            "notes",
            "delivery_address",
            "metadata",
            "payment_method",
            "payment_status",
            "upi_utr",
            "payment_proof_url",
            "upi_pay_url",
            "delivery_fee",
            "lines",
            "created_at",
            "updated_at",
        ]

    def _pos(self, obj: ShopOrder) -> dict:
        metadata = obj.metadata if isinstance(obj.metadata, dict) else {}
        pos = metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {}
        return pos

    def get_payment_method(self, obj: ShopOrder) -> str:
        return str(self._pos(obj).get("payment_method") or "")

    def get_payment_status(self, obj: ShopOrder) -> str:
        return str(self._pos(obj).get("payment_status") or "")

    def get_upi_utr(self, obj: ShopOrder) -> str:
        return str(self._pos(obj).get("upi_utr") or "")

    def get_payment_proof_url(self, obj: ShopOrder) -> str:
        return str(self._pos(obj).get("payment_proof_url") or "")

    def get_delivery_fee(self, obj: ShopOrder) -> str:
        metadata = obj.metadata if isinstance(obj.metadata, dict) else {}
        return str(metadata.get("delivery_fee") or "0")

    def get_upi_pay_url(self, obj: ShopOrder) -> str:
        from apps.common.upi import build_upi_pay_url

        pos = self._pos(obj)
        method = str(pos.get("payment_method") or "").lower()
        status_value = str(pos.get("payment_status") or "").lower()
        if method != "upi" or status_value in {"paid", "settled"}:
            return ""
        business = getattr(obj, "business", None)
        vpa = str(getattr(business, "upi_vpa", "") or "").strip() if business else ""
        if not vpa:
            return ""
        return build_upi_pay_url(
            vpa=vpa,
            payee_name=str(getattr(business, "display_name", "") or "Shop"),
            amount=obj.total,
            note=obj.order_number,
            currency=obj.currency or "INR",
        )


class ShopOrderCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    fulfillment_mode = serializers.ChoiceField(choices=FulfillmentMode.choices, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    delivery_address = serializers.CharField(required=False, allow_blank=True)
    delivery_city = serializers.CharField(required=False, allow_blank=True)
    delivery_postal_code = serializers.CharField(required=False, allow_blank=True)
    confirm = serializers.BooleanField(required=False, default=False)
    bill_discount_type = serializers.ChoiceField(
        choices=[("percent", "Percent"), ("amount", "Amount"), ("", "None")],
        required=False,
        allow_blank=True,
    )
    bill_discount_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )
    payment_method = serializers.ChoiceField(
        choices=[
            ("cash", "Cash"),
            ("upi", "UPI"),
            ("card", "Card"),
            ("borrow", "Borrow"),
            ("", "None"),
        ],
        required=False,
        allow_blank=True,
    )
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)


class BarcodeBulkLookupSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    codes = serializers.ListField(child=serializers.CharField(max_length=128), allow_empty=False)


class ShopReturnSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopReturn
        fields = [
            "id",
            "business",
            "order",
            "customer",
            "return_number",
            "status",
            "reason",
            "restock",
            "refund_total",
            "currency",
            "credit_invoice",
            "line_items",
            "created_at",
            "updated_at",
        ]


class ShopReturnCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    order_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True)
    restock = serializers.BooleanField(required=False, default=True)
    complete = serializers.BooleanField(required=False, default=True)
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)


class ShopDeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopDeliveryZone
        fields = [
            "id",
            "business",
            "name",
            "enabled",
            "cities",
            "postal_prefixes",
            "same_day",
            "fee",
            "min_order_total",
            "notes",
            "metadata",
            "created_at",
            "updated_at",
        ]


class ShopDeliveryZoneWriteSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    enabled = serializers.BooleanField(required=False, default=True)
    cities = serializers.ListField(child=serializers.CharField(), required=False)
    postal_prefixes = serializers.ListField(child=serializers.CharField(), required=False)
    same_day = serializers.BooleanField(required=False, default=True)
    fee = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    min_order_total = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.DictField(required=False)


class ShopDeliveryMatchSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    city = serializers.CharField(required=False, allow_blank=True)
    postal_code = serializers.CharField(required=False, allow_blank=True)


class ShopPetSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = ShopPet
        fields = [
            "id",
            "business",
            "customer",
            "customer_name",
            "name",
            "species",
            "breed",
            "sex",
            "birthday",
            "photo_url",
            "medical_notes",
            "medical_records",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_customer_name(self, obj: ShopPet) -> str:
        customer = getattr(obj, "customer", None)
        if customer is None:
            return ""
        return str(getattr(customer, "display_name", None) or getattr(customer, "full_name", None) or "")


class ShopPetWriteSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    customer_id = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    species = serializers.CharField(required=False, allow_blank=True, max_length=80)
    breed = serializers.CharField(required=False, allow_blank=True, max_length=120)
    sex = serializers.CharField(required=False, allow_blank=True, max_length=32)
    birthday = serializers.DateField(required=False, allow_null=True)
    photo_url = serializers.CharField(required=False, allow_blank=True, max_length=1024)
    medical_notes = serializers.CharField(required=False, allow_blank=True)
    medical_records = serializers.ListField(child=serializers.DictField(), required=False)
    metadata = serializers.DictField(required=False)


class ShopPetNotifySerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField()
    channels = serializers.ListField(
        child=serializers.ChoiceField(choices=["in_app", "email"]),
        required=False,
        default=["in_app", "email"],
    )


class ShopSettingsSerializer(serializers.ModelSerializer):
    pets_enabled = serializers.SerializerMethodField()

    class Meta:
        model = ShopBusinessSettings
        fields = [
            "id",
            "business",
            "enabled_packs",
            "pets_enabled",
            "default_fulfillment_mode",
            "same_day_delivery_enabled",
            "metadata",
        ]

    def get_pets_enabled(self, obj: ShopBusinessSettings) -> bool:
        return obj.pets_enabled()


class ShopSettingsPatchSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    enabled_packs = serializers.ListField(child=serializers.CharField(), required=False)
    enable_pets = serializers.BooleanField(required=False)
    default_fulfillment_mode = serializers.ChoiceField(
        choices=FulfillmentMode.choices, required=False
    )
    same_day_delivery_enabled = serializers.BooleanField(required=False)
    metadata = serializers.DictField(required=False)


class ShopOrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OrderStatus.choices)


class ShopOrderSettlePaymentSerializer(serializers.Serializer):
    settled_via = serializers.ChoiceField(
        choices=[("cash", "Cash"), ("upi", "UPI"), ("card", "Card")],
        required=False,
        default="cash",
    )


class ShopInvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopInvoice
        fields = [
            "id",
            "business",
            "customer",
            "order",
            "invoice_number",
            "status",
            "currency",
            "subtotal",
            "tax_total",
            "total",
            "amount_paid",
            "notes",
            "line_items",
            "created_at",
            "updated_at",
        ]


class ShopQuotationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopQuotation
        fields = [
            "id",
            "business",
            "customer",
            "quotation_number",
            "status",
            "currency",
            "subtotal",
            "tax_total",
            "total",
            "notes",
            "line_items",
            "valid_until",
            "converted_order",
            "created_at",
            "updated_at",
        ]


class ShopQuotationCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    valid_until = serializers.DateField(required=False, allow_null=True)
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)


class ShopStockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopStockMovement
        fields = [
            "id",
            "product",
            "movement_type",
            "quantity_delta",
            "quantity_after",
            "reason",
            "order",
            "created_at",
        ]


# Silence unused import warning for BarcodeType used in docs/OpenAPI choices elsewhere
_ = BarcodeType


# ---------------------------------------------------------------------------
# ShopIE GST books: suppliers, cash accounts, vouchers, party ledger
# ---------------------------------------------------------------------------


class ShopSupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSupplier
        fields = [
            "id",
            "business",
            "name",
            "phone",
            "email",
            "gstin",
            "billing_state",
            "billing_address",
            "credit_limit",
            "opening_balance",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ShopSupplierWriteSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    name = serializers.CharField(max_length=200)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True)
    gstin = serializers.CharField(required=False, allow_blank=True, max_length=20)
    billing_state = serializers.CharField(required=False, allow_blank=True, max_length=120)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    credit_limit = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    opening_balance = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    metadata = serializers.DictField(required=False)


class ShopSupplierPatchSerializer(ShopSupplierWriteSerializer):
    business_id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=200, required=False)


class ShopCashAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopCashAccount
        fields = [
            "id",
            "business",
            "name",
            "account_type",
            "opening_balance",
            "current_balance",
            "is_active",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "current_balance", "created_at", "updated_at"]


class ShopCashAccountWriteSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    account_type = serializers.ChoiceField(choices=CashAccountType.choices, required=False)
    opening_balance = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=0
    )
    is_active = serializers.BooleanField(required=False, default=True)
    metadata = serializers.DictField(required=False)


class ShopBooksVoucherLineSerializer(serializers.Serializer):
    product_id = serializers.UUIDField(required=False, allow_null=True)
    name = serializers.CharField(required=False, allow_blank=True)
    hsn_sac = serializers.CharField(required=False, allow_blank=True)
    qty = serializers.DecimalField(max_digits=12, decimal_places=3)
    rate = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    gst_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)


class ShopBooksVoucherSerializer(serializers.ModelSerializer):
    voucher_type_display = serializers.CharField(source="get_voucher_type_display", read_only=True)
    customer_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    cash_account_name = serializers.SerializerMethodField()
    contra_account_name = serializers.SerializerMethodField()

    class Meta:
        model = ShopBooksVoucher
        fields = [
            "id",
            "business",
            "voucher_type",
            "voucher_type_display",
            "voucher_number",
            "voucher_date",
            "status",
            "customer",
            "customer_name",
            "supplier",
            "supplier_name",
            "cash_account",
            "cash_account_name",
            "contra_account",
            "contra_account_name",
            "currency",
            "subtotal",
            "discount_total",
            "tax_total",
            "cgst_total",
            "sgst_total",
            "igst_total",
            "total",
            "amount_paid",
            "place_of_supply",
            "is_interstate",
            "notes",
            "line_items",
            "linked_order",
            "linked_invoice",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_customer_name(self, obj: ShopBooksVoucher) -> str:
        return str(obj.customer.display_name) if obj.customer_id else ""

    def get_supplier_name(self, obj: ShopBooksVoucher) -> str:
        return str(obj.supplier.name) if obj.supplier_id else ""

    def get_cash_account_name(self, obj: ShopBooksVoucher) -> str:
        return str(obj.cash_account.name) if obj.cash_account_id else ""

    def get_contra_account_name(self, obj: ShopBooksVoucher) -> str:
        return str(obj.contra_account.name) if obj.contra_account_id else ""


class ShopSaleVoucherCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    voucher_date = serializers.DateField(required=False)
    voucher_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    status = serializers.ChoiceField(choices=VoucherStatus.choices, required=False)
    lines = ShopBooksVoucherLineSerializer(many=True)
    is_interstate = serializers.BooleanField(required=False, default=False)
    place_of_supply = serializers.CharField(required=False, allow_blank=True, max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True)
    amount_paid = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=0
    )
    cash_account_id = serializers.UUIDField(required=False, allow_null=True)
    currency = serializers.CharField(required=False, allow_blank=True, max_length=3)
    metadata = serializers.DictField(required=False)


class ShopPurchaseVoucherCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    supplier_id = serializers.UUIDField(required=False, allow_null=True)
    voucher_date = serializers.DateField(required=False)
    voucher_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    status = serializers.ChoiceField(choices=VoucherStatus.choices, required=False)
    lines = ShopBooksVoucherLineSerializer(many=True)
    is_interstate = serializers.BooleanField(required=False, default=False)
    place_of_supply = serializers.CharField(required=False, allow_blank=True, max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True)
    amount_paid = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=0
    )
    cash_account_id = serializers.UUIDField(required=False, allow_null=True)
    currency = serializers.CharField(required=False, allow_blank=True, max_length=3)
    metadata = serializers.DictField(required=False)


class ShopCreditNoteCreateSerializer(ShopSaleVoucherCreateSerializer):
    """Same shape as sale — customer + lines; amount_paid is optional refund."""


class ShopDebitNoteCreateSerializer(ShopPurchaseVoucherCreateSerializer):
    """Same shape as purchase — supplier + lines."""


class ShopPaymentInCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    customer_id = serializers.UUIDField()
    cash_account_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    voucher_date = serializers.DateField(required=False)
    voucher_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    notes = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.DictField(required=False)


class ShopPaymentOutCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    supplier_id = serializers.UUIDField()
    cash_account_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    voucher_date = serializers.DateField(required=False)
    voucher_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    notes = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.DictField(required=False)


class ShopExpenseCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    cash_account_id = serializers.UUIDField()
    supplier_id = serializers.UUIDField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    category = serializers.CharField(required=False, allow_blank=True, max_length=80)
    voucher_date = serializers.DateField(required=False)
    voucher_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    notes = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.DictField(required=False)


class ShopOtherIncomeCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    cash_account_id = serializers.UUIDField()
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    category = serializers.CharField(required=False, allow_blank=True, max_length=80)
    voucher_date = serializers.DateField(required=False)
    voucher_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    notes = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.DictField(required=False)


class ShopTransferCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    cash_account_id = serializers.UUIDField()
    contra_account_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    voucher_date = serializers.DateField(required=False)
    voucher_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    notes = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.DictField(required=False)


class ShopPartyLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopPartyLedgerEntry
        fields = [
            "id",
            "party_kind",
            "customer",
            "supplier",
            "entry_type",
            "amount",
            "direction",
            "balance_after",
            "voucher",
            "notes",
            "metadata",
            "created_at",
        ]


class ShopPartyStatementQuerySerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=PartyKind.choices)
    id = serializers.UUIDField()


class ShopQuotationConvertSerializer(serializers.Serializer):
    voucher_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    amount_paid = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=0
    )
    cash_account_id = serializers.UUIDField(required=False, allow_null=True)
    is_interstate = serializers.BooleanField(required=False, default=False)
    place_of_supply = serializers.CharField(required=False, allow_blank=True, max_length=120)


class ShopBooksDocumentSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    doc_type_display = serializers.CharField(source="get_doc_type_display", read_only=True)

    class Meta:
        model = ShopBooksDocument
        fields = [
            "id",
            "business",
            "doc_type",
            "doc_type_display",
            "document_number",
            "document_date",
            "status",
            "customer",
            "customer_name",
            "supplier",
            "supplier_name",
            "currency",
            "subtotal",
            "tax_total",
            "total",
            "notes",
            "line_items",
            "converted_voucher",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_customer_name(self, obj) -> str:
        if not obj.customer_id:
            return ""
        c = obj.customer
        return (
            getattr(c, "full_name", None)
            or getattr(c, "display_name", None)
            or " ".join(filter(None, [getattr(c, "first_name", ""), getattr(c, "last_name", "")])).strip()
            or getattr(c, "email", "")
            or str(c.id)
        )

    def get_supplier_name(self, obj) -> str:
        return str(obj.supplier.name) if obj.supplier_id else ""


class ShopBooksDocumentCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    doc_type = serializers.ChoiceField(
        choices=["sale_order", "purchase_order", "delivery_challan", "job_work"]
    )
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    supplier_id = serializers.UUIDField(required=False, allow_null=True)
    document_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)


class ShopBooksDocumentConvertSerializer(serializers.Serializer):
    amount_paid = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=0
    )
    cash_account_id = serializers.UUIDField(required=False, allow_null=True)


class ShopGodownSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopGodown
        fields = [
            "id",
            "business",
            "name",
            "code",
            "is_default",
            "is_active",
            "metadata",
            "created_at",
        ]


class ShopGodownCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    code = serializers.CharField(required=False, allow_blank=True, max_length=32)
    is_default = serializers.BooleanField(required=False, default=False)


class ShopStockTransferSerializer(serializers.ModelSerializer):
    from_godown_name = serializers.CharField(source="from_godown.name", read_only=True)
    to_godown_name = serializers.CharField(source="to_godown.name", read_only=True)

    class Meta:
        model = ShopStockTransfer
        fields = [
            "id",
            "business",
            "from_godown",
            "from_godown_name",
            "to_godown",
            "to_godown_name",
            "transfer_number",
            "transfer_date",
            "status",
            "notes",
            "line_items",
            "created_at",
        ]


class ShopStockTransferCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    from_godown_id = serializers.UUIDField()
    to_godown_id = serializers.UUIDField()
    transfer_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)


class ShopChequeSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = ShopCheque
        fields = [
            "id",
            "business",
            "direction",
            "status",
            "customer",
            "customer_name",
            "supplier",
            "supplier_name",
            "cash_account",
            "amount",
            "cheque_number",
            "bank_name",
            "due_date",
            "cleared_at",
            "linked_voucher",
            "notes",
            "created_at",
        ]

    def get_customer_name(self, obj) -> str:
        return str(obj.customer_id and (getattr(obj.customer, "full_name", None) or obj.customer_id) or "")

    def get_supplier_name(self, obj) -> str:
        return str(obj.supplier.name) if obj.supplier_id else ""


class ShopChequeCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    direction = serializers.ChoiceField(choices=["in", "out"])
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    cheque_number = serializers.CharField(max_length=64)
    bank_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    due_date = serializers.DateField(required=False)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    supplier_id = serializers.UUIDField(required=False, allow_null=True)
    cash_account_id = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ShopChequeClearSerializer(serializers.Serializer):
    cash_account_id = serializers.UUIDField(required=False, allow_null=True)


class ShopLoanSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = ShopLoan
        fields = [
            "id",
            "business",
            "party_kind",
            "customer",
            "customer_name",
            "supplier",
            "supplier_name",
            "title",
            "principal",
            "interest_rate",
            "balance",
            "start_date",
            "status",
            "notes",
            "repayments",
            "created_at",
        ]

    def get_customer_name(self, obj) -> str:
        return str(obj.customer_id and (getattr(obj.customer, "full_name", None) or obj.customer_id) or "")

    def get_supplier_name(self, obj) -> str:
        return str(obj.supplier.name) if obj.supplier_id else ""


class ShopLoanCreateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    title = serializers.CharField(max_length=160)
    principal = serializers.DecimalField(max_digits=14, decimal_places=2)
    interest_rate = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=0
    )
    party_kind = serializers.ChoiceField(choices=["customer", "supplier"], required=False, default="customer")
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    supplier_id = serializers.UUIDField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class ShopLoanRepaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True)


# ---------------------------------------------------------------------------
# GST e-invoice (IRN) + e-way bill compliance
# ---------------------------------------------------------------------------


class ShopGstComplianceSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(
        choices=["mock", "nic_sandbox", "nic_production", "custom"], required=False
    )
    username = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(required=False, allow_blank=True)
    client_id = serializers.CharField(required=False, allow_blank=True)
    client_secret = serializers.CharField(required=False, allow_blank=True)
    base_url = serializers.CharField(required=False, allow_blank=True)
    seller_legal_name = serializers.CharField(required=False, allow_blank=True)
    seller_trade_name = serializers.CharField(required=False, allow_blank=True)
    seller_addr1 = serializers.CharField(required=False, allow_blank=True)
    seller_addr2 = serializers.CharField(required=False, allow_blank=True)
    seller_loc = serializers.CharField(required=False, allow_blank=True)
    seller_pin = serializers.CharField(required=False, allow_blank=True)
    seller_state_code = serializers.CharField(required=False, allow_blank=True)
    seller_phone = serializers.CharField(required=False, allow_blank=True)
    seller_email = serializers.CharField(required=False, allow_blank=True)


class ShopComplianceSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopBusinessSettings
        fields = [
            "id",
            "business",
            "einvoice_enabled",
            "eway_enabled",
            "gst_compliance",
        ]


class ShopComplianceSettingsPatchSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    einvoice_enabled = serializers.BooleanField(required=False)
    eway_enabled = serializers.BooleanField(required=False)
    gst_compliance = ShopGstComplianceSerializer(required=False)


class ShopEInvoiceSerializer(serializers.ModelSerializer):
    voucher_number = serializers.CharField(source="voucher.voucher_number", read_only=True)

    class Meta:
        model = ShopEInvoice
        fields = [
            "id",
            "business",
            "voucher",
            "voucher_number",
            "status",
            "doc_type",
            "irn",
            "ack_no",
            "ack_date",
            "signed_qr",
            "signed_invoice",
            "error_message",
            "cancelled_at",
            "cancel_reason",
            "metadata",
            "created_at",
            "updated_at",
        ]


class ShopEInvoiceGenerateSerializer(serializers.Serializer):
    allow_b2c = serializers.BooleanField(required=False, default=False)


class ShopEInvoiceCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class ShopEWayBillSerializer(serializers.ModelSerializer):
    voucher_number = serializers.CharField(source="voucher.voucher_number", read_only=True)

    class Meta:
        model = ShopEWayBill
        fields = [
            "id",
            "business",
            "voucher",
            "voucher_number",
            "einvoice",
            "status",
            "ewb_no",
            "ewb_date",
            "valid_upto",
            "supply_type",
            "sub_supply_type",
            "doc_type",
            "transporter_id",
            "transporter_name",
            "transport_mode",
            "vehicle_no",
            "vehicle_type",
            "distance_km",
            "from_place",
            "from_state_code",
            "to_place",
            "to_state_code",
            "error_message",
            "cancelled_at",
            "cancel_reason",
            "metadata",
            "created_at",
            "updated_at",
        ]


class ShopEWayGenerateSerializer(serializers.Serializer):
    supply_type = serializers.ChoiceField(choices=EWaySupplyType.choices, required=False)
    sub_supply_type = serializers.CharField(required=False, allow_blank=True, max_length=8)
    doc_type = serializers.CharField(required=False, allow_blank=True, max_length=8)
    transporter_id = serializers.CharField(required=False, allow_blank=True, max_length=20)
    transporter_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    transport_mode = serializers.ChoiceField(
        choices=[("1", "Road"), ("2", "Rail"), ("3", "Air"), ("4", "Ship")], required=False
    )
    vehicle_no = serializers.CharField(required=False, allow_blank=True, max_length=20)
    vehicle_type = serializers.ChoiceField(choices=[("R", "Regular"), ("O", "ODC")], required=False)
    distance_km = serializers.IntegerField(required=False, min_value=0, default=0)
    from_place = serializers.CharField(required=False, allow_blank=True, max_length=120)
    from_state_code = serializers.CharField(required=False, allow_blank=True, max_length=32)
    to_place = serializers.CharField(required=False, allow_blank=True, max_length=120)
    to_state_code = serializers.CharField(required=False, allow_blank=True, max_length=32)


class ShopEWayCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
