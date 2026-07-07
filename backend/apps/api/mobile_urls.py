from django.urls import path

from apps.api.mobile_views import (
    MobileAvailabilityView,
    MobileBookingCancelView,
    MobileBookingDetailView,
    MobileBookingListView,
    MobileBookingRequestView,
    MobileBookingRescheduleView,
    MobileBootstrapView,
    MobileCustomerProfileView,
    MobileCustomerRegisterView,
    MobileDiscoverServicesView,
    MobileNotificationListView,
    MobileNotificationMarkReadView,
    MobileNotificationReadAllView,
    MobileStaffListView,
)
from apps.notifications.api.stream_views import MobileNotificationStreamView

urlpatterns = [
    path("mobile/bootstrap", MobileBootstrapView.as_view(), name="mobile-bootstrap"),
    path("mobile/auth/register", MobileCustomerRegisterView.as_view(), name="mobile-customer-register"),
    path("mobile/customer/profile", MobileCustomerProfileView.as_view(), name="mobile-customer-profile"),
    path("mobile/discover/services", MobileDiscoverServicesView.as_view(), name="mobile-discover-services"),
    path("mobile/staff", MobileStaffListView.as_view(), name="mobile-staff-list"),
    path("mobile/availability", MobileAvailabilityView.as_view(), name="mobile-availability"),
    path("mobile/bookings", MobileBookingListView.as_view(), name="mobile-booking-list"),
    path("mobile/bookings/<uuid:booking_id>", MobileBookingDetailView.as_view(), name="mobile-booking-detail"),
    path("mobile/bookings/<uuid:booking_id>/cancel", MobileBookingCancelView.as_view(), name="mobile-booking-cancel"),
    path(
        "mobile/bookings/<uuid:booking_id>/reschedule",
        MobileBookingRescheduleView.as_view(),
        name="mobile-booking-reschedule",
    ),
    path("mobile/bookings/request", MobileBookingRequestView.as_view(), name="mobile-booking-request"),
    path("mobile/notifications/stream", MobileNotificationStreamView.as_view(), name="mobile-notification-stream"),
    path("mobile/notifications", MobileNotificationListView.as_view(), name="mobile-notification-list"),
    path("mobile/notifications/read-all", MobileNotificationReadAllView.as_view(), name="mobile-notification-read-all"),
    path(
        "mobile/notifications/<uuid:notification_id>/read",
        MobileNotificationMarkReadView.as_view(),
        name="mobile-notification-mark-read",
    ),
]
