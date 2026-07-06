from django.urls import path

from apps.services.api.views import ServiceCategoryViewSet, ServiceTagViewSet, ServiceViewSet

service_list = ServiceViewSet.as_view({"get": "list", "post": "create"})
service_detail = ServiceViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
category_list = ServiceCategoryViewSet.as_view({"get": "list", "post": "create"})
category_detail = ServiceCategoryViewSet.as_view({"patch": "partial_update", "delete": "destroy"})
service_tag_list = ServiceTagViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("services", service_list, name="service-list-create"),
    path("services/tags", service_tag_list, name="service-tag-list-create"),
    path("services/<uuid:pk>", service_detail, name="service-detail"),
    path("service-categories", category_list, name="service-category-list-create"),
    path("service-categories/<uuid:pk>", category_detail, name="service-category-detail"),
]
