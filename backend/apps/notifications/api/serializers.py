from __future__ import annotations

from rest_framework import serializers

from apps.notifications.models import Notification, NotificationTemplate


def notification_type_from_metadata(metadata: dict | None) -> str:
    event_type = str((metadata or {}).get("event_type") or "").lower()
    if "pet" in event_type:
        return "pet"
    if "cancel" in event_type:
        return "cancel"
    if "return" in event_type:
        return "return"
    if "shoporder" in event_type or "order" in event_type:
        return "order"
    if "reminder" in event_type:
        return "reminder"
    if "complete" in event_type:
        return "review"
    if "payment" in event_type:
        return "payment"
    return "booking"


class NotificationSerializer(serializers.ModelSerializer):
    booking_id = serializers.UUIDField(read_only=True, allow_null=True)
    pet_id = serializers.SerializerMethodField()
    order_id = serializers.SerializerMethodField()
    return_id = serializers.SerializerMethodField()
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
            "pet_id",
            "order_id",
            "return_id",
            "notification_type",
        ]
        read_only_fields = fields

    def get_notification_type(self, obj: Notification) -> str:
        return notification_type_from_metadata(obj.metadata)

    def get_pet_id(self, obj: Notification) -> str | None:
        pet_id = (obj.metadata or {}).get("pet_id")
        return str(pet_id) if pet_id else None

    def get_order_id(self, obj: Notification) -> str | None:
        order_id = (obj.metadata or {}).get("order_id")
        return str(order_id) if order_id else None

    def get_return_id(self, obj: Notification) -> str | None:
        return_id = (obj.metadata or {}).get("return_id")
        return str(return_id) if return_id else None


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ["id", "code", "name", "subject", "body", "channel", "locale", "is_active"]
        read_only_fields = fields
