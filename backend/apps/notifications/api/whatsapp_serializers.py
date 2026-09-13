from __future__ import annotations

from rest_framework import serializers


class WhatsAppSettingsUpdateSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    phone_number_id = serializers.CharField(max_length=80, required=False, allow_blank=True)
    waba_id = serializers.CharField(max_length=80, required=False, allow_blank=True)
    access_token = serializers.CharField(max_length=512, required=False, allow_blank=True, write_only=True)
    enabled = serializers.BooleanField(required=False)
    test_connection = serializers.BooleanField(required=False, default=False)
    disconnect = serializers.BooleanField(required=False, default=False)


class WhatsAppTemplateActionSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    code = serializers.SlugField(required=False)
    enabled = serializers.BooleanField(required=False)
    to = serializers.CharField(max_length=32, required=False, allow_blank=True)
