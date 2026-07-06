from __future__ import annotations

from rest_framework import serializers


class CalendarConnectSerializer(serializers.Serializer):
    client_id = serializers.CharField(required=False, allow_blank=True)
    client_secret = serializers.CharField(required=False, allow_blank=True)


class CalendarStatusSerializer(serializers.Serializer):
    connected = serializers.BooleanField()
    provider = serializers.CharField()
    business_id = serializers.CharField()
