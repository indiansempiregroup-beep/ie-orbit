from django.urls import path

from apps.businesses.api.views import BusinessViewSet

business_list = BusinessViewSet.as_view({"get": "list", "post": "create"})
business_detail = BusinessViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
business_me = BusinessViewSet.as_view({"get": "me", "patch": "partial_update_me"})

urlpatterns = [
    path("businesses", business_list, name="business-list-create"),
    path("businesses/me", business_me, name="business-me"),
    path("businesses/<uuid:pk>", business_detail, name="business-detail"),
]
