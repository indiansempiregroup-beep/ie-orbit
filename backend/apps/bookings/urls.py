from django.urls import path

from apps.bookings.api.views import (
    AvailabilityView,
    BookingCancelView,
    BookingCheckInView,
    BookingCompleteView,
    BookingConfirmView,
    BookingDetailView,
    BookingListCreateView,
    BookingRescheduleView,
    BookingReviewListView,
    BusinessAvailabilityView,
    StaffAvailabilityView,
    StaffEmergencySlotDetailView,
    StaffEmergencySlotListCreateView,
    StaffLeaveDetailView,
    StaffLeaveListCreateView,
    StaffSlotBlockDetailView,
    StaffSlotBlockListCreateView,
    StaffSpecialAvailabilityDetailView,
    StaffSpecialAvailabilityListCreateView,
    StaffWeeklyScheduleBulkView,
    StaffWeeklyScheduleListCreateView,
)

urlpatterns = [
    path("bookings", BookingListCreateView.as_view(), name="booking-list-create"),
    path("booking-reviews", BookingReviewListView.as_view(), name="booking-review-list"),
    path("bookings/<uuid:booking_id>", BookingDetailView.as_view(), name="booking-detail"),
    path(
        "bookings/<uuid:booking_id>/confirm", BookingConfirmView.as_view(), name="booking-confirm"
    ),
    path("bookings/<uuid:booking_id>/cancel", BookingCancelView.as_view(), name="booking-cancel"),
    path(
        "bookings/<uuid:booking_id>/reschedule",
        BookingRescheduleView.as_view(),
        name="booking-reschedule",
    ),
    path(
        "bookings/<uuid:booking_id>/check-in", BookingCheckInView.as_view(), name="booking-check-in"
    ),
    path(
        "bookings/<uuid:booking_id>/complete",
        BookingCompleteView.as_view(),
        name="booking-complete",
    ),
    path("availability", AvailabilityView.as_view(), name="availability"),
    path("availability/staff", StaffAvailabilityView.as_view(), name="availability-staff"),
    path("availability/business", BusinessAvailabilityView.as_view(), name="availability-business"),
    path(
        "staff-weekly-schedules",
        StaffWeeklyScheduleListCreateView.as_view(),
        name="staff-weekly-schedule-list-create",
    ),
    path(
        "staff-weekly-schedules/bulk",
        StaffWeeklyScheduleBulkView.as_view(),
        name="staff-weekly-schedule-bulk",
    ),
    path("staff-leaves", StaffLeaveListCreateView.as_view(), name="staff-leave-list-create"),
    path(
        "staff-leaves/<uuid:leave_id>",
        StaffLeaveDetailView.as_view(),
        name="staff-leave-detail",
    ),
    path(
        "staff-special-availability",
        StaffSpecialAvailabilityListCreateView.as_view(),
        name="staff-special-availability-list-create",
    ),
    path(
        "staff-special-availability/<uuid:special_id>",
        StaffSpecialAvailabilityDetailView.as_view(),
        name="staff-special-availability-detail",
    ),
    path(
        "staff-slot-blocks",
        StaffSlotBlockListCreateView.as_view(),
        name="staff-slot-block-list-create",
    ),
    path(
        "staff-slot-blocks/<uuid:block_id>",
        StaffSlotBlockDetailView.as_view(),
        name="staff-slot-block-detail",
    ),
    path(
        "staff-emergency-slots",
        StaffEmergencySlotListCreateView.as_view(),
        name="staff-emergency-slot-list-create",
    ),
    path(
        "staff-emergency-slots/<uuid:slot_id>",
        StaffEmergencySlotDetailView.as_view(),
        name="staff-emergency-slot-detail",
    ),
]
