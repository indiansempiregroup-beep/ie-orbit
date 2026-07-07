from __future__ import annotations

from rest_framework import serializers

from apps.businesses.models import WhiteLabelProfile


class WhiteLabelProfileSerializer(serializers.ModelSerializer):
    business_id = serializers.UUIDField(source="business.id", read_only=True)
    business_display_name = serializers.CharField(source="business.display_name", read_only=True)
    tenant_slug = serializers.CharField(source="tenant.slug", read_only=True)

    class Meta:
        model = WhiteLabelProfile
        fields = [
            "id",
            "business_id",
            "business_display_name",
            "tenant_slug",
            "flavor_key",
            "app_slug",
            "app_name",
            "bundle_id_ios",
            "bundle_id_android",
            "logo",
            "dark_logo",
            "splash_image",
            "favicon",
            "primary_color",
            "secondary_color",
            "accent_color",
            "theme_mode",
            "white_label_enabled",
            "typography_settings",
            "build_metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class WhiteLabelProfileUpsertSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhiteLabelProfile
        fields = [
            "flavor_key",
            "app_slug",
            "app_name",
            "bundle_id_ios",
            "bundle_id_android",
            "logo",
            "dark_logo",
            "splash_image",
            "favicon",
            "primary_color",
            "secondary_color",
            "accent_color",
            "theme_mode",
            "white_label_enabled",
            "typography_settings",
            "build_metadata",
        ]
