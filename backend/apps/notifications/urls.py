from django.urls import path

from apps.notifications.api.views import NotificationViewSet

notification_list = NotificationViewSet.as_view({"get": "list"})
notification_mark_read = NotificationViewSet.as_view({"patch": "mark_read"})
notification_read_all = NotificationViewSet.as_view({"patch": "read_all"})
notification_delete = NotificationViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path("notifications", notification_list, name="notification-list"),
    path("notifications/<uuid:pk>/read", notification_mark_read, name="notification-mark-read"),
    path("notifications/read-all", notification_read_all, name="notification-read-all"),
    path("notifications/<uuid:pk>", notification_delete, name="notification-delete"),
]
