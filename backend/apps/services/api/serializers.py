from __future__ import annotations

from rest_framework import serializers

from apps.services.models import (
    Service,
    ServiceCategory,
    ServiceDuration,
    ServiceImage,
    ServicePricing,
    ServiceTag,
    ServiceVariant,
    TaxConfiguration,
)


class ServiceDurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceDuration
        fields = [
            "id",
            "variant",
            "duration_minutes",
            "buffer_before_minutes",
            "buffer_after_minutes",
            "cleanup_minutes",
            "is_default",
        ]
        read_only_fields = ["id"]


class ServicePricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServicePricing
        fields = [
            "id",
            "variant",
            "currency",
            "base_price",
            "sale_price",
            "tax_inclusive",
            "is_default",
            "metadata",
        ]
        read_only_fields = ["id"]


class ServiceVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceVariant
        fields = ["id", "name", "description", "sku", "status", "display_order", "metadata"]
        read_only_fields = ["id"]


class TaxConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxConfiguration
        fields = ["id", "tax_name", "tax_rate", "tax_identifier", "is_active_tax", "metadata"]
        read_only_fields = ["id"]


class ServiceImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = ServiceImage
        fields = ["id", "media", "alt_text", "display_order", "is_primary", "image_url", "thumbnail_url"]
        read_only_fields = ["id", "image_url", "thumbnail_url"]

    def get_image_url(self, obj: ServiceImage) -> str:
        media = getattr(obj, "media", None)
        if media is None:
            return ""
        return str(media.metadata.get("public_url") or media.metadata.get("private_url") or "")

    def get_thumbnail_url(self, obj: ServiceImage) -> str:
        media = getattr(obj, "media", None)
        if media is None:
            return ""
        return str(
            media.metadata.get("thumbnail_url")
            or media.metadata.get("public_url")
            or media.metadata.get("private_url")
            or ""
        )


class ServicePrimaryImageSerializer(serializers.Serializer):
    media_id = serializers.UUIDField(required=False)
    alt_text = serializers.CharField(required=False, allow_blank=True, max_length=160)
    clear = serializers.BooleanField(required=False, default=False)


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = [
            "id",
            "tenant",
            "business",
            "parent",
            "name",
            "slug",
            "description",
            "display_order",
            "status",
            "metadata",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at", "is_active"]


class ServiceSerializer(serializers.ModelSerializer):
    default_duration = ServiceDurationSerializer(required=False, write_only=True)
    default_price = ServicePricingSerializer(required=False, write_only=True)
    primary_image = ServicePrimaryImageSerializer(required=False, write_only=True)
    durations = ServiceDurationSerializer(many=True, read_only=True)
    prices = ServicePricingSerializer(many=True, read_only=True)
    variants = ServiceVariantSerializer(many=True, read_only=True)
    taxes = TaxConfigurationSerializer(many=True, read_only=True)
    images = ServiceImageSerializer(many=True, read_only=True)

    class Meta:
        model = Service
        fields = [
            "id",
            "tenant",
            "business",
            "category",
            "service_code",
            "name",
            "display_name",
            "short_description",
            "description",
            "status",
            "visibility",
            "online_booking_enabled",
            "gender_restriction",
            "min_age",
            "max_age",
            "tags",
            "display_order",
            "addons_metadata",
            "packages_metadata",
            "metadata",
            "default_duration",
            "default_price",
            "primary_image",
            "durations",
            "prices",
            "variants",
            "taxes",
            "images",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "durations",
            "prices",
            "variants",
            "taxes",
            "images",
            "created_at",
            "updated_at",
            "is_active",
        ]

    def validate_tags(self, value: list[str]) -> list[str]:
        return [tag.strip().lower() for tag in value if tag.strip()]

    def create(self, validated_data: dict[str, object]) -> Service:
        raise NotImplementedError("Service creation is handled by the service layer.")


class ServiceTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceTag
        fields = ["id", "business", "name", "color", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
