from django.urls import path

from apps.calendar.api.views import CalendarViewSet

calendar_connect = CalendarViewSet.as_view({"post": "connect"})
calendar_disconnect = CalendarViewSet.as_view({"delete": "disconnect"})
calendar_status = CalendarViewSet.as_view({"get": "status"})

urlpatterns = [
    path("calendar/connect", calendar_connect, name="calendar-connect"),
    path("calendar/disconnect", calendar_disconnect, name="calendar-disconnect"),
    path("calendar/status", calendar_status, name="calendar-status"),
]
