from __future__ import annotations

from rest_framework import serializers

from apps.bookings.models import (
    Booking,
    BookingAttachment,
    BookingChannel,
    BookingHistory,
    BookingNote,
    BookingSource,
    BookingTimeline,
    RecurrenceFrequency,
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


class BookingSerializer(serializers.ModelSerializer):
    timeline = BookingTimelineSerializer(many=True, read_only=True)
    history = BookingHistorySerializer(many=True, read_only=True)
    booking_notes = BookingNoteSerializer(many=True, read_only=True)
    attachments = BookingAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "tenant",
            "business",
            "booking_number",
            "customer_id",
            "staff_id",
            "service_id",
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
            "timeline",
            "history",
            "booking_notes",
            "attachments",
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
            "created_at",
            "updated_at",
            "is_active",
        ]


class BookingCreateSerializer(serializers.Serializer):
    business = serializers.UUIDField(required=False)
    customer_id = serializers.UUIDField()
    staff_id = serializers.UUIDField(required=False, allow_null=True)
    service_id = serializers.UUIDField()
    start_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=1)
    buffer_before_minutes = serializers.IntegerField(min_value=0, required=False, default=0)
    buffer_after_minutes = serializers.IntegerField(min_value=0, required=False, default=0)
    source = serializers.ChoiceField(choices=BookingSource.choices, required=False)
    channel = serializers.ChoiceField(choices=BookingChannel.choices, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    recurrence_frequency = serializers.ChoiceField(
        choices=RecurrenceFrequency.choices,
        required=False,
    )
    recurrence_rule = serializers.JSONField(required=False, default=dict)
    metadata = serializers.JSONField(required=False, default=dict)


class BookingPatchSerializer(serializers.Serializer):
    staff_id = serializers.UUIDField(required=False, allow_null=True)
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
    date = serializers.DateField()
    duration_minutes = serializers.IntegerField(min_value=1, default=30)
    interval_minutes = serializers.IntegerField(min_value=1, default=15)
    buffer_minutes = serializers.IntegerField(min_value=0, default=0)


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


class StaffWeeklyScheduleBulkSerializer(serializers.Serializer):
    business = serializers.UUIDField(required=False)
    staff_id = serializers.UUIDField()
    schedules = StaffWeeklyScheduleInputSerializer(many=True)
