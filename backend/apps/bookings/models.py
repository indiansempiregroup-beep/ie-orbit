from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class BookingStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    CHECKED_IN = "checked_in", "Checked In"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    REJECTED = "rejected", "Rejected"
    NO_SHOW = "no_show", "No Show"
    EXPIRED = "expired", "Expired"
    RESCHEDULED = "rescheduled", "Rescheduled"


class BookingSource(models.TextChoices):
    CUSTOMER_APP = "customer_app", "Customer App"
    OPERATIONS_DASHBOARD = "operations_dashboard", "Operations Dashboard"
    PLATFORM_ADMIN = "platform_admin", "Platform Admin"
    API = "api", "API"


class BookingChannel(models.TextChoices):
    WEB = "web", "Web"
    MOBILE = "mobile", "Mobile"
    PHONE = "phone", "Phone"
    WALK_IN = "walk_in", "Walk In"
    API = "api", "API"


class ScheduleType(models.TextChoices):
    DEFAULT = "default", "Default"
    SEASONAL = "seasonal", "Seasonal"
    TEMPORARY = "temporary", "Temporary"


class RecurrenceFrequency(models.TextChoices):
    NONE = "none", "None"
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"
    CUSTOM = "custom", "Custom"


class BusinessSchedule(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="schedules"
    )
    name = models.CharField(max_length=120)
    schedule_type = models.CharField(
        max_length=32, choices=ScheduleType.choices, default=ScheduleType.DEFAULT
    )
    timezone = models.CharField(max_length=64, default="UTC")
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_default = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "business_schedules"
        ordering = ["business", "name"]

    def __str__(self) -> str:
        return f"{self.business.display_name} {self.name}"


class BusinessWeeklySchedule(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    schedule = models.ForeignKey(
        BusinessSchedule, on_delete=models.CASCADE, related_name="weekly_days"
    )
    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="weekly_schedules"
    )
    weekday = models.PositiveSmallIntegerField(db_index=True)
    is_open = models.BooleanField(default=True)
    opening_time = models.TimeField()
    closing_time = models.TimeField()
    break_periods = models.JSONField(default=list, blank=True)
    capacity = models.PositiveIntegerField(default=1)

    class Meta(TenantModel.Meta):
        db_table = "business_weekly_schedules"
        constraints = [
            models.UniqueConstraint(
                fields=["schedule", "weekday"], name="uq_business_schedule_weekday"
            )
        ]


class BusinessHoliday(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="holidays"
    )
    name = models.CharField(max_length=160)
    date = models.DateField(db_index=True)
    all_day = models.BooleanField(default=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    reason = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "business_holidays"
        indexes = [*TenantModel.Meta.indexes, models.Index(fields=["tenant", "business", "date"])]


class SpecialWorkingDay(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="special_working_days"
    )
    date = models.DateField(db_index=True)
    opening_time = models.TimeField()
    closing_time = models.TimeField()
    break_periods = models.JSONField(default=list, blank=True)
    capacity = models.PositiveIntegerField(default=1)
    reason = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "special_working_days"


class EmergencyClosure(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="emergency_closures"
    )
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(db_index=True)
    reason = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "emergency_closures"


class StaffWeeklySchedule(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="staff_weekly_schedules"
    )
    staff_id = models.UUIDField(db_index=True)
    weekday = models.PositiveSmallIntegerField(db_index=True)
    is_available = models.BooleanField(default=True)
    shift_start = models.TimeField()
    shift_end = models.TimeField()
    break_periods = models.JSONField(default=list, blank=True)
    capacity = models.PositiveIntegerField(default=1)
    overtime_allowed = models.BooleanField(default=False)

    class Meta(TenantModel.Meta):
        db_table = "staff_weekly_schedules"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "staff_id", "weekday"],
                name="uq_staff_weekly_schedule",
            )
        ]


class StaffLeave(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="staff_leaves"
    )
    staff_id = models.UUIDField(db_index=True)
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(db_index=True)
    leave_type = models.CharField(max_length=80, default="leave")
    reason = models.TextField(blank=True)
    approved = models.BooleanField(default=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_leaves"


class StaffSpecialAvailability(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.CASCADE, related_name="staff_special_availability"
    )
    staff_id = models.UUIDField(db_index=True)
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(db_index=True)
    capacity = models.PositiveIntegerField(default=1)
    reason = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_special_availability"


class Booking(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.PROTECT, related_name="bookings"
    )
    booking_number = models.CharField(max_length=32, unique=True, db_index=True)
    customer_id = models.UUIDField(db_index=True)
    staff_id = models.UUIDField(null=True, blank=True, db_index=True)
    service_id = models.UUIDField(db_index=True)
    appointment_date = models.DateField(db_index=True)
    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveIntegerField()
    buffer_before_minutes = models.PositiveIntegerField(default=0)
    buffer_after_minutes = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=32, choices=BookingStatus.choices, default=BookingStatus.PENDING, db_index=True
    )
    source = models.CharField(
        max_length=40, choices=BookingSource.choices, default=BookingSource.CUSTOMER_APP
    )
    channel = models.CharField(
        max_length=40, choices=BookingChannel.choices, default=BookingChannel.WEB
    )
    notes = models.TextField(blank=True)
    cancellation_reason = models.TextField(blank=True)
    reschedule_reason = models.TextField(blank=True)
    recurrence_frequency = models.CharField(
        max_length=24, choices=RecurrenceFrequency.choices, default=RecurrenceFrequency.NONE
    )
    recurrence_rule = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "bookings"
        ordering = ["-start_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "appointment_date"]),
            models.Index(fields=["tenant", "staff_id", "start_at", "end_at"]),
            models.Index(fields=["tenant", "customer_id", "start_at"]),
            models.Index(fields=["tenant", "service_id", "start_at"]),
            models.Index(fields=["tenant", "status", "appointment_date"]),
        ]

    def __str__(self) -> str:
        return self.booking_number


class BookingTimeline(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="timeline")
    status = models.CharField(max_length=32, choices=BookingStatus.choices)
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    actor_id = models.UUIDField(null=True, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "booking_timeline"
        ordering = ["created_at"]


class BookingNote(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="booking_notes")
    note = models.TextField()
    is_internal = models.BooleanField(default=True)

    class Meta(TenantModel.Meta):
        db_table = "booking_notes"


class BookingAttachment(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="attachments")
    media = models.ForeignKey(
        "platform_media.Media", on_delete=models.PROTECT, related_name="booking_attachments"
    )
    title = models.CharField(max_length=160, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "booking_attachments"


class BookingHistory(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="history")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True
    )
    from_status = models.CharField(max_length=32, blank=True)
    to_status = models.CharField(max_length=32, choices=BookingStatus.choices)
    reason = models.TextField(blank=True)
    snapshot = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "booking_history"
        ordering = ["created_at"]


class BookingEvent(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=120, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "booking_events"
        ordering = ["created_at"]
