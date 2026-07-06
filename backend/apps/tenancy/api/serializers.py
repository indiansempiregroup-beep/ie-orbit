from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.tenancy.models import (
    Branding,
    Organization,
    OrganizationSettings,
    Subscription,
    Tenant,
    TenantSettings,
)


class BrandingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branding
        fields = [
            "app_name",
            "logo",
            "dark_logo",
            "favicon",
            "primary_color",
            "secondary_color",
            "accent_color",
            "theme_mode",
            "typography_settings",
            "brand_metadata",
            "white_label_enabled",
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id",
            "plan",
            "plan_code",
            "plan_name",
            "status",
            "trial_starts_at",
            "trial_ends_at",
            "current_period_starts_at",
            "current_period_ends_at",
            "renewal_date",
            "feature_flags",
            "limits",
            "external_reference",
        ]
        read_only_fields = ["id", "plan_code", "plan_name"]


class TenantSettingsSerializer(serializers.ModelSerializer):
    branding = BrandingSerializer(required=False)
    subscription = SubscriptionSerializer(required=False)

    class Meta:
        model = TenantSettings
        fields = [
            "id",
            "business_hours",
            "booking_preferences",
            "localization",
            "timezone",
            "currency",
            "language",
            "notification_defaults",
            "security_preferences",
            "branding",
            "subscription",
        ]
        read_only_fields = ["id"]

    def to_representation(self, instance: TenantSettings) -> dict[str, object]:
        data = super().to_representation(instance)
        branding = Branding.objects.for_tenant(instance.tenant).first()
        data["branding"] = BrandingSerializer(branding).data
        data["subscription"] = SubscriptionSerializer(
            Subscription.objects.for_tenant(instance.tenant).first()
        ).data
        return data

    def update(self, instance: TenantSettings, validated_data: dict[str, object]) -> TenantSettings:
        branding_data = validated_data.pop("branding", None)
        subscription_data = validated_data.pop("subscription", None)
        instance = super().update(instance, validated_data)
        if isinstance(branding_data, dict):
            branding = Branding.objects.for_tenant(instance.tenant).get()
            for field, value in branding_data.items():
                setattr(branding, field, value)
            branding.save()
        if isinstance(subscription_data, dict):
            subscription = Subscription.objects.for_tenant(instance.tenant).get()
            for field, value in subscription_data.items():
                setattr(subscription, field, value)
            subscription.save()
        return instance


class TenantSerializer(serializers.ModelSerializer):
    branding = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            "id",
            "slug",
            "display_name",
            "legal_name",
            "status",
            "owner",
            "timezone",
            "currency",
            "language",
            "country",
            "state",
            "city",
            "logo",
            "favicon",
            "primary_color",
            "secondary_color",
            "brand_settings",
            "subscription_reference",
            "branding",
            "subscription",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "owner",
            "branding",
            "subscription",
            "created_at",
            "updated_at",
            "is_active",
        ]

    @extend_schema_field(BrandingSerializer)
    def get_branding(self, tenant: Tenant) -> dict[str, object]:
        return BrandingSerializer(Branding.objects.for_tenant(tenant).first()).data

    @extend_schema_field(SubscriptionSerializer)
    def get_subscription(self, tenant: Tenant) -> dict[str, object]:
        return SubscriptionSerializer(Subscription.objects.for_tenant(tenant).first()).data


class OrganizationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationSettings
        fields = [
            "business_hours",
            "booking_preferences",
            "localization",
            "timezone",
            "currency",
            "language",
            "notification_defaults",
            "security_preferences",
        ]


class OrganizationSerializer(serializers.ModelSerializer):
    settings = OrganizationSettingsSerializer(read_only=True)

    class Meta:
        model = Organization
        fields = [
            "id",
            "tenant",
            "name",
            "legal_name",
            "business_category",
            "description",
            "contact_email",
            "contact_phone",
            "alternate_phone",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "country",
            "tax_identifier",
            "tax_registration_type",
            "website",
            "social_links",
            "settings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "tenant", "settings", "created_at", "updated_at"]
