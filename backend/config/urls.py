from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/", include("apps.api.urls")),
]

if settings.DEBUG:
    from django.conf.urls.static import static

    urlpatterns += static(f"/{settings.MEDIA_URL.lstrip('/')}", document_root=settings.MEDIA_ROOT)
