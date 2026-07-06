from django.contrib import admin

from apps.bookings.models import (
    Booking,
    BookingAttachment,
    BookingEvent,
    BookingHistory,
    BookingNote,
    BookingTimeline,
    BusinessHoliday,
    BusinessSchedule,
    BusinessWeeklySchedule,
    EmergencyClosure,
    SpecialWorkingDay,
    StaffLeave,
    StaffSpecialAvailability,
    StaffWeeklySchedule,
)


class BookingTimelineInline(admin.TabularInline):
    model = BookingTimeline
    extra = 0
    readonly_fields = ("created_at",)


class BookingNoteInline(admin.TabularInline):
    model = BookingNote
    extra = 0


class BookingAttachmentInline(admin.TabularInline):
    model = BookingAttachment
    extra = 0


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "booking_number",
        "business",
        "customer_id",
        "staff_id",
        "service_id",
        "start_at",
        "status",
        "channel",
    )
    search_fields = (
        "booking_number",
        "customer_id",
        "staff_id",
        "service_id",
        "business__display_name",
    )
    list_filter = ("status", "source", "channel", "appointment_date")
    readonly_fields = ("id", "created_at", "updated_at", "created_by", "updated_by")
    inlines = [BookingTimelineInline, BookingNoteInline, BookingAttachmentInline]


@admin.register(BusinessSchedule)
class BusinessScheduleAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "schedule_type", "timezone", "is_default")
    search_fields = ("name", "business__display_name", "tenant__slug")
    list_filter = ("schedule_type", "is_default")


@admin.register(BusinessWeeklySchedule)
class BusinessWeeklyScheduleAdmin(admin.ModelAdmin):
    list_display = ("business", "weekday", "is_open", "opening_time", "closing_time", "capacity")
    list_filter = ("weekday", "is_open")


@admin.register(BusinessHoliday)
class BusinessHolidayAdmin(admin.ModelAdmin):
    list_display = ("business", "name", "date", "all_day")
    search_fields = ("name", "business__display_name")
    list_filter = ("date", "all_day")


@admin.register(SpecialWorkingDay)
class SpecialWorkingDayAdmin(admin.ModelAdmin):
    list_display = ("business", "date", "opening_time", "closing_time", "capacity")
    list_filter = ("date",)


@admin.register(EmergencyClosure)
class EmergencyClosureAdmin(admin.ModelAdmin):
    list_display = ("business", "starts_at", "ends_at")
    search_fields = ("business__display_name", "reason")


@admin.register(StaffWeeklySchedule)
class StaffWeeklyScheduleAdmin(admin.ModelAdmin):
    list_display = ("business", "staff_id", "weekday", "shift_start", "shift_end", "capacity")
    search_fields = ("business__display_name", "staff_id")
    list_filter = ("weekday", "is_available")


@admin.register(StaffLeave)
class StaffLeaveAdmin(admin.ModelAdmin):
    list_display = ("business", "staff_id", "starts_at", "ends_at", "leave_type", "approved")
    search_fields = ("business__display_name", "staff_id", "reason")
    list_filter = ("leave_type", "approved")


@admin.register(StaffSpecialAvailability)
class StaffSpecialAvailabilityAdmin(admin.ModelAdmin):
    list_display = ("business", "staff_id", "starts_at", "ends_at", "capacity")
    search_fields = ("business__display_name", "staff_id")


@admin.register(BookingTimeline)
class BookingTimelineAdmin(admin.ModelAdmin):
    list_display = ("booking", "status", "title", "created_at")
    search_fields = ("booking__booking_number", "title")


@admin.register(BookingHistory)
class BookingHistoryAdmin(admin.ModelAdmin):
    list_display = ("booking", "from_status", "to_status", "created_at")
    search_fields = ("booking__booking_number", "reason")


@admin.register(BookingEvent)
class BookingEventAdmin(admin.ModelAdmin):
    list_display = ("booking", "event_type", "published_at", "created_at")
    search_fields = ("booking__booking_number", "event_type")
