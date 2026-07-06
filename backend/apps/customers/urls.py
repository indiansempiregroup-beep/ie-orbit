from django.urls import path

from apps.customers.api.views import CustomerTagViewSet, CustomerViewSet

customer_list = CustomerViewSet.as_view({"get": "list", "post": "create"})
customer_detail = CustomerViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
customer_restore = CustomerViewSet.as_view({"post": "restore"})
customer_merge = CustomerViewSet.as_view({"post": "merge"})
customer_bulk_archive = CustomerViewSet.as_view({"post": "bulk_archive"})
customer_import = CustomerViewSet.as_view({"post": "import_foundation"})
customer_export = CustomerViewSet.as_view({"post": "export_foundation"})
customer_tag_list = CustomerTagViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("customers", customer_list, name="customer-list-create"),
    path("customers/bulk/archive", customer_bulk_archive, name="customer-bulk-archive"),
    path("customers/import", customer_import, name="customer-import-foundation"),
    path("customers/export", customer_export, name="customer-export-foundation"),
    path("customers/tags", customer_tag_list, name="customer-tag-list-create"),
    path("customers/<uuid:pk>", customer_detail, name="customer-detail"),
    path("customers/<uuid:pk>/restore", customer_restore, name="customer-restore"),
    path("customers/<uuid:pk>/merge", customer_merge, name="customer-merge"),
]
