from django.urls import path

from apps.platform_media.api.views import (
    MediaDetailView,
    MediaListView,
    MediaUploadMultipleView,
    MediaUploadView,
)

urlpatterns = [
    path("media", MediaListView.as_view(), name="media-list"),
    path("media/upload", MediaUploadView.as_view(), name="media-upload"),
    path("media/upload-multiple", MediaUploadMultipleView.as_view(), name="media-upload-multiple"),
    path("media/<uuid:media_id>", MediaDetailView.as_view(), name="media-detail"),
]
