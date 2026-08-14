from __future__ import annotations

from rest_framework import serializers

from apps.billing.models import BillingWebhookEvent


class BillingCheckoutSerializer(serializers.Serializer):
    product_code = serializers.SlugField()
    plan_code = serializers.SlugField()


class BillingCheckoutResponseSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    order_id = serializers.CharField()
    amount = serializers.IntegerField()
    currency = serializers.CharField()
    product_code = serializers.CharField()
    plan_code = serializers.CharField()
    configured = serializers.BooleanField()
    key_id = serializers.CharField(allow_null=True)
    mock_mode = serializers.BooleanField()
    expires_at = serializers.DateTimeField()


class BillingWebhookEventSerializer(serializers.ModelSerializer):
    tenant_id = serializers.UUIDField(allow_null=True)
    tenant_name = serializers.SerializerMethodField()
    tenant_slug = serializers.SerializerMethodField()

    class Meta:
        model = BillingWebhookEvent
        fields = [
            "id",
            "tenant_id",
            "tenant_name",
            "tenant_slug",
            "provider",
            "external_event_id",
            "event_type",
            "status",
            "retry_count",
            "next_retry_at",
            "processed_at",
            "error_message",
            "created_at",
        ]

    def get_tenant_name(self, obj: BillingWebhookEvent) -> str | None:
        return obj.tenant.display_name if getattr(obj, "tenant_id", None) else None

    def get_tenant_slug(self, obj: BillingWebhookEvent) -> str | None:
        return obj.tenant.slug if getattr(obj, "tenant_id", None) else None


class BillingWebhookBulkReprocessSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["failed", "dead_letter"])
    limit = serializers.IntegerField(min_value=1, max_value=200, default=50)
    confirm = serializers.BooleanField(default=False)
