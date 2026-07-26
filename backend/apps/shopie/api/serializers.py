from __future__ import annotations

from rest_framework import serializers

from apps.shopie.models import (
    BarcodeType,
    FulfillmentMode,
    OrderStatus,
    ProductCategory,
    ProductStatus,
    ShopBusinessSettings,
    ShopDeliveryZone,
    ShopInvoice,
    ShopOrder,
    ShopOrderLine,
    ShopPet,
    ShopProduct,
    ShopProductBarcode,
    ShopQuotation,
    ShopReturn,
    ShopStockMovement,
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
            "lines",
            "created_at",
            "updated_at",
        ]


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
    class Meta:
        model = ShopPet
        fields = [
            "id",
            "business",
            "customer",
            "name",
            "species",
            "breed",
            "sex",
            "birthday",
            "medical_notes",
            "medical_records",
            "metadata",
            "created_at",
            "updated_at",
        ]


class ShopPetWriteSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    customer_id = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    species = serializers.CharField(required=False, allow_blank=True, max_length=80)
    breed = serializers.CharField(required=False, allow_blank=True, max_length=120)
    sex = serializers.CharField(required=False, allow_blank=True, max_length=32)
    birthday = serializers.DateField(required=False, allow_null=True)
    medical_notes = serializers.CharField(required=False, allow_blank=True)
    medical_records = serializers.ListField(child=serializers.DictField(), required=False)
    metadata = serializers.DictField(required=False)


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
