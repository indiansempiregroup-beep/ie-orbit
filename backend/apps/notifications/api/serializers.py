from __future__ import annotations

from rest_framework import serializers

from apps.notifications.models import Notification, NotificationTemplate


def notification_type_from_metadata(metadata: dict | None) -> str:
    event_type = str((metadata or {}).get("event_type") or "").lower()
    if "cancel" in event_type:
        return "cancel"
    if "reminder" in event_type:
        return "reminder"
    if "complete" in event_type:
        return "review"
    if "payment" in event_type:
        return "payment"
    return "booking"


class NotificationSerializer(serializers.ModelSerializer):
    booking_id = serializers.UUIDField(read_only=True, allow_null=True)
    notification_type = serializers.SerializerMethodField()

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
            "booking_id",
            "notification_type",
        ]
        read_only_fields = fields

    def get_notification_type(self, obj: Notification) -> str:
        return notification_type_from_metadata(obj.metadata)


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ["id", "code", "name", "subject", "body", "channel", "locale", "is_active"]
        read_only_fields = fields
