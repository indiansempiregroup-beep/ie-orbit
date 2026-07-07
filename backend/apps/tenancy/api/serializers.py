from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.tenancy.models import (
    Branding,
    Organization,
    OrganizationSettings,
    Subscription,
    SubscriptionPlan,
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
    selected_product = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    product_code = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    product_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)

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
            "selected_product",
            "product_code",
            "product_name",
            "branding",
            "subscription",
        ]
        read_only_fields = ["id"]

    def to_representation(self, instance: TenantSettings) -> dict[str, object]:
        data = super().to_representation(instance)
        branding = Branding.objects.for_tenant(instance.tenant).first()
        subscription = Subscription.objects.for_tenant(instance.tenant).first()
        data["branding"] = BrandingSerializer(branding).data if branding else None
        data["subscription"] = SubscriptionSerializer(subscription).data if subscription else None
        selected_product = None
        product_code = None
        product_name = None
        if subscription and subscription.plan:
            selected_product = subscription.plan.code
            product_code = subscription.plan.code
            product_name = subscription.plan.name
        elif subscription and isinstance(subscription.feature_flags, dict):
            selected_product = subscription.feature_flags.get("selected_product")
            product_code = subscription.feature_flags.get("product_code")
            product_name = subscription.feature_flags.get("product_name")
        data["selected_product"] = selected_product
        data["product_code"] = product_code
        data["product_name"] = product_name
        return data

    def update(self, instance: TenantSettings, validated_data: dict[str, object]) -> TenantSettings:
        branding_data = validated_data.pop("branding", None)
        subscription_data = validated_data.pop("subscription", None)
        selected_product = validated_data.pop("selected_product", None)
        product_code = validated_data.pop("product_code", None)
        product_name = validated_data.pop("product_name", None)
        instance = super().update(instance, validated_data)
        if isinstance(branding_data, dict):
            branding, _ = Branding.objects.get_or_create(
                tenant=instance.tenant,
                defaults={"app_name": instance.tenant.display_name},
            )
            for field, value in branding_data.items():
                setattr(branding, field, value)
            branding.save()

        subscription = Subscription.objects.for_tenant(instance.tenant).first()
        if subscription is None:
            subscription = Subscription.objects.create(tenant=instance.tenant)

        plan_code = None
        if isinstance(subscription_data, dict):
            plan_value = subscription_data.get("plan")
            if isinstance(plan_value, str) and plan_value:
                plan_code = plan_value
        if not plan_code and isinstance(selected_product, str) and selected_product:
            plan_code = selected_product
        if not plan_code and isinstance(product_code, str) and product_code:
            plan_code = product_code

        if plan_code:
            plan_name = None
            if isinstance(product_name, str) and product_name:
                plan_name = product_name
            elif isinstance(subscription_data, dict):
                plan_name_value = subscription_data.get("plan_name")
                if isinstance(plan_name_value, str) and plan_name_value:
                    plan_name = plan_name_value
            if not plan_name:
                plan_name = plan_code.replace("-", " ").title()
            plan, _ = SubscriptionPlan.objects.get_or_create(
                code=plan_code,
                defaults={"name": plan_name, "is_public": True},
            )
            if plan.name != plan_name:
                plan.name = plan_name
                plan.save(update_fields=["name"])
            subscription.plan = plan

        if isinstance(subscription_data, dict):
            for field, value in subscription_data.items():
                if field == "plan":
                    continue
                setattr(subscription, field, value)

        if isinstance(selected_product, str) and selected_product:
            subscription.feature_flags = {
                **subscription.feature_flags,
                "selected_product": selected_product,
            }
        if isinstance(product_code, str) and product_code:
            subscription.feature_flags = {
                **subscription.feature_flags,
                "product_code": product_code,
            }
        if isinstance(product_name, str) and product_name:
            subscription.feature_flags = {
                **subscription.feature_flags,
                "product_name": product_name,
            }

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
