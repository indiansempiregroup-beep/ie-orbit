from __future__ import annotations

from rest_framework import serializers

from apps.notifications.models import Notification, NotificationTemplate


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "subject",
            "body",
            "channel",
            "status",
            "is_read",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ["id", "code", "name", "subject", "body", "channel", "locale", "is_active"]
        read_only_fields = fields
