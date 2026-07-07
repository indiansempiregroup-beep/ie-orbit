from __future__ import annotations

from rest_framework import serializers


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
