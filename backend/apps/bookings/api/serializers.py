from __future__ import annotations

from rest_framework import serializers

from apps.common.api.fields import QueryUUIDListField
from apps.bookings.models import (
    Booking,
    BookingAttachment,
    BookingChannel,
    BookingHistory,
    BookingLineItem,
    BookingNote,
    BookingReview,
    BookingSource,
    BookingTimeline,
    RecurrenceFrequency,
    StaffEmergencySlot,
    StaffLeave,
    StaffSlotBlock,
    StaffSpecialAvailability,
    StaffWeeklySchedule,
)


class BookingTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingTimeline
        fields = ["id", "status", "title", "description", "actor_id", "created_at"]
        read_only_fields = fields


class BookingHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingHistory
        fields = ["id", "from_status", "to_status", "reason", "snapshot", "created_at"]
        read_only_fields = fields


class BookingNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingNote
        fields = ["id", "note", "is_internal", "created_at"]
        read_only_fields = ["id", "created_at"]


class BookingAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingAttachment
        fields = ["id", "media", "title", "created_at"]
        read_only_fields = ["id", "created_at"]


class BookingReviewSerializer(serializers.ModelSerializer):
    booking_id = serializers.UUIDField(source="booking.id", read_only=True)
    booking_number = serializers.CharField(source="booking.booking_number", read_only=True)
    business = serializers.UUIDField(source="business_id", read_only=True)
    service_id = serializers.UUIDField(source="booking.service_id", read_only=True)
    service_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = BookingReview
        fields = [
            "id",
            "business",
            "booking_id",
            "booking_number",
            "customer_id",
            "customer_name",
            "service_id",
            "service_name",
            "rating",
            "comment",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_service_name(self, obj: BookingReview) -> str:
        service_map = self.context.get("service_map") or {}
        service = service_map.get(str(obj.booking.service_id)) if obj.booking.service_id else None
        if service is not None:
            return service.display_name or service.name
        return ""

    def get_customer_name(self, obj: BookingReview) -> str:
        customer_map = self.context.get("customer_map") or {}
        customer = customer_map.get(str(obj.customer_id))
        if customer is not None:
            return customer.display_name or "Customer"
        return "Customer"


class BookingReviewSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingReview
        fields = ["id", "rating", "comment", "created_at"]
        read_only_fields = fields


class BookingLineItemSerializer(serializers.ModelSerializer):
    service_name = serializers.SerializerMethodField()
    staff_name = serializers.SerializerMethodField()

    class Meta:
        model = BookingLineItem
        fields = [
            "id",
            "service_id",
            "service_name",
            "staff_id",
            "staff_name",
            "start_at",
            "end_at",
            "duration_minutes",
            "buffer_before_minutes",
            "buffer_after_minutes",
            "sort_order",
            "price_snapshot",
            "variant_id",
        ]
        read_only_fields = fields

    def get_service_name(self, obj: BookingLineItem) -> str:
        from apps.bookings.api.display import service_label

        service_map = self.context.get("service_map") or {}
        return service_label(service_map=service_map, service_id=obj.service_id)

    def get_staff_name(self, obj: BookingLineItem) -> str:
        staff_map = self.context.get("staff_map") or {}
        staff = staff_map.get(str(obj.staff_id)) if obj.staff_id else None
        if staff is not None:
            return staff.display_name or ""
        return ""


class BookingLineItemInputSerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    duration_minutes = serializers.IntegerField(min_value=1, required=False)
    sort_order = serializers.IntegerField(min_value=0, required=False)


class BookingLineItemStaffInputSerializer(serializers.Serializer):
    line_item_id = serializers.UUIDField()
    staff_id = serializers.UUIDField(allow_null=True)


class BookingSerializer(serializers.ModelSerializer):
    timeline = BookingTimelineSerializer(many=True, read_only=True)
    history = BookingHistorySerializer(many=True, read_only=True)
    booking_notes = BookingNoteSerializer(many=True, read_only=True)
    attachments = BookingAttachmentSerializer(many=True, read_only=True)
    review = BookingReviewSummarySerializer(read_only=True, allow_null=True)
    line_items = BookingLineItemSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    staff_name = serializers.SerializerMethodField()
    service_label = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id",
            "tenant",
            "business",
            "branch",
            "booking_number",
            "customer_id",
            "customer_name",
            "customer_phone",
            "staff_id",
            "staff_name",
            "service_id",
            "service_label",
            "appointment_date",
            "start_at",
            "end_at",
            "duration_minutes",
            "buffer_before_minutes",
            "buffer_after_minutes",
            "status",
            "source",
            "channel",
            "notes",
            "cancellation_reason",
            "reschedule_reason",
            "recurrence_frequency",
            "recurrence_rule",
            "metadata",
            "line_items",
            "timeline",
            "history",
            "booking_notes",
            "attachments",
            "review",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "business",
            "booking_number",
            "appointment_date",
            "end_at",
            "status",
            "cancellation_reason",
            "reschedule_reason",
            "timeline",
            "history",
            "booking_notes",
            "attachments",
            "review",
            "created_at",
            "updated_at",
            "is_active",
        ]

    def get_customer_name(self, obj: Booking) -> str:
        customer_map = self.context.get("customer_map") or {}
        customer = customer_map.get(str(obj.customer_id))
        if customer is not None:
            return customer.display_name or "Customer"
        return ""

    def get_customer_phone(self, obj: Booking) -> str:
        from apps.customers.services.contact import resolve_customer_phone

        customer_map = self.context.get("customer_map") or {}
        customer = customer_map.get(str(obj.customer_id))
        return resolve_customer_phone(customer)

    def get_staff_name(self, obj: Booking) -> str:
        from apps.bookings.services.notification_context import booking_staff_summary

        staff_map = self.context.get("staff_map") or {}
        return booking_staff_summary(booking=obj, staff_map=staff_map)

    def get_service_label(self, obj: Booking) -> str:
        from apps.bookings.api.display import booking_service_summary

        service_map = self.context.get("service_map") or {}
        return booking_service_summary(booking=obj, service_map=service_map)


class BookingCreateSerializer(serializers.Serializer):
    business = serializers.UUIDField(required=False)
    branch_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField()
    staff_id = serializers.UUIDField(required=False, allow_null=True)
    service_id = serializers.UUIDField(required=False)
    items = BookingLineItemInputSerializer(many=True, required=False)
    start_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=1, required=False)
    buffer_before_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    buffer_after_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    source = serializers.ChoiceField(choices=BookingSource.choices, required=False)
    channel = serializers.ChoiceField(choices=BookingChannel.choices, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    recurrence_frequency = serializers.ChoiceField(
        choices=RecurrenceFrequency.choices,
        required=False,
    )
    recurrence_rule = serializers.JSONField(required=False, default=dict)
    metadata = serializers.JSONField(required=False, default=dict)
    points_to_redeem = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs: dict) -> dict:
        has_service = bool(attrs.get("service_id"))
        has_items = bool(attrs.get("items"))
        if has_service and has_items:
            raise serializers.ValidationError("Provide either service_id or items, not both.")
        if not has_service and not has_items:
            raise serializers.ValidationError("Provide service_id or items.")
        if has_service and not attrs.get("duration_minutes"):
            raise serializers.ValidationError({"duration_minutes": "Required when using service_id."})
        return attrs


class BookingPatchSerializer(serializers.Serializer):
    staff_id = serializers.UUIDField(required=False, allow_null=True)
    line_item_staff = BookingLineItemStaffInputSerializer(many=True, required=False)
    start_at = serializers.DateTimeField(required=False)
    duration_minutes = serializers.IntegerField(min_value=1, required=False)
    buffer_before_minutes = serializers.IntegerField(min_value=0, required=False)
    buffer_after_minutes = serializers.IntegerField(min_value=0, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.JSONField(required=False)


class BookingActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class BookingRescheduleSerializer(serializers.Serializer):
    start_at = serializers.DateTimeField()
    reason = serializers.CharField(required=False, allow_blank=True)


class AvailabilityQuerySerializer(serializers.Serializer):
    business = serializers.UUIDField(required=False)
    staff_id = serializers.UUIDField(required=False)
    service_id = serializers.UUIDField(required=False)
    service_ids = QueryUUIDListField()
    items = BookingLineItemInputSerializer(many=True, required=False)
    date = serializers.DateField()
    duration_minutes = serializers.IntegerField(min_value=1, default=30, required=False)
    interval_minutes = serializers.IntegerField(min_value=1, default=15)
    buffer_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class AvailabilitySlotSerializer(serializers.Serializer):
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
    staff_id = serializers.CharField(allow_null=True)
    capacity = serializers.IntegerField()


class StaffWeeklyScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffWeeklySchedule
        fields = [
            "id",
            "business",
            "staff_id",
            "weekday",
            "is_available",
            "shift_start",
            "shift_end",
            "break_periods",
            "capacity",
            "overtime_allowed",
        ]
        read_only_fields = ["id"]


class StaffWeeklyScheduleInputSerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    is_available = serializers.BooleanField(default=True)
    shift_start = serializers.TimeField()
    shift_end = serializers.TimeField()
    capacity = serializers.IntegerField(min_value=1, default=1)
    break_periods = serializers.JSONField(required=False, default=list)
    overtime_allowed = serializers.BooleanField(required=False, default=False)


class StaffWeeklyScheduleBulkSerializer(serializers.Serializer):
    business = serializers.UUIDField(required=False)
    staff_id = serializers.UUIDField()
    schedules = StaffWeeklyScheduleInputSerializer(many=True)


class StaffLeaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffLeave
        fields = [
            "id",
            "business",
            "staff_id",
            "starts_at",
            "ends_at",
            "leave_type",
            "reason",
            "approved",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"business": {"required": False}}


class StaffSpecialAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffSpecialAvailability
        fields = [
            "id",
            "business",
            "staff_id",
            "starts_at",
            "ends_at",
            "capacity",
            "reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"business": {"required": False}}


class StaffSlotBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffSlotBlock
        fields = [
            "id",
            "business",
            "staff_id",
            "date",
            "start_time",
            "end_time",
            "reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"business": {"required": False}}


class StaffEmergencySlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffEmergencySlot
        fields = [
            "id",
            "business",
            "staff_id",
            "date",
            "start_time",
            "end_time",
            "capacity",
            "reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"business": {"required": False}}
