from django.urls import path

from apps.businesses.api.branch_views import BranchViewSet
from apps.businesses.api.platform_views import (
    PlatformTenantAdminDetailView,
    PlatformTenantAdminListView,
    PlatformWhiteLabelDetailView,
    PlatformWhiteLabelListView,
)
from apps.businesses.api.product_plan_views import ProductPlanListView
from apps.businesses.api.views import BusinessViewSet
from apps.staff.api.invitation_views import BusinessInvitationListCreateView, BusinessInvitationRevokeView

business_list = BusinessViewSet.as_view({"get": "list", "post": "create"})
business_detail = BusinessViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
business_subscribe_product = BusinessViewSet.as_view({"post": "subscribe_product"})
business_unsubscribe_product = BusinessViewSet.as_view({"delete": "unsubscribe_product"})
business_change_product_plan = BusinessViewSet.as_view({"patch": "change_product_plan"})
business_cancel_pending_plan = BusinessViewSet.as_view({"delete": "cancel_pending_plan_change"})
business_update_product_addons = BusinessViewSet.as_view({"patch": "update_product_addons"})
business_billing_snapshot = BusinessViewSet.as_view({"get": "billing_snapshot"})
business_me = BusinessViewSet.as_view({"get": "me", "patch": "partial_update_me"})
branch_list = BranchViewSet.as_view({"get": "list", "post": "create"})
branch_detail = BranchViewSet.as_view({"get": "retrieve", "patch": "partial_update"})

urlpatterns = [
    path("product-plans", ProductPlanListView.as_view(), name="product-plan-list"),
    path("businesses", business_list, name="business-list-create"),
    path("businesses/me", business_me, name="business-me"),
    path("businesses/<uuid:pk>", business_detail, name="business-detail"),
    path(
        "businesses/<uuid:pk>/billing",
        business_billing_snapshot,
        name="business-billing-snapshot",
    ),
    path(
        "businesses/<uuid:pk>/product-subscriptions",
        business_subscribe_product,
        name="business-subscribe-product",
    ),
    path(
        "businesses/<uuid:pk>/product-subscriptions/<slug:product_code>",
        business_unsubscribe_product,
        name="business-unsubscribe-product",
    ),
    path(
        "businesses/<uuid:pk>/product-subscriptions/<slug:product_code>/plan",
        business_change_product_plan,
        name="business-change-product-plan",
    ),
    path(
        "businesses/<uuid:pk>/product-subscriptions/<slug:product_code>/pending-plan",
        business_cancel_pending_plan,
        name="business-cancel-pending-plan",
    ),
    path(
        "businesses/<uuid:pk>/product-subscriptions/<slug:product_code>/addons",
        business_update_product_addons,
        name="business-update-product-addons",
    ),
    path("businesses/<uuid:business_pk>/branches", branch_list, name="branch-list-create"),
    path("businesses/<uuid:business_pk>/branches/<uuid:pk>", branch_detail, name="branch-detail"),
    path(
        "businesses/<uuid:pk>/invitations",
        BusinessInvitationListCreateView.as_view(),
        name="business-invitation-list-create",
    ),
    path(
        "businesses/<uuid:pk>/invitations/<uuid:invitation_id>",
        BusinessInvitationRevokeView.as_view(),
        name="business-invitation-revoke",
    ),
    path("platform/white-label", PlatformWhiteLabelListView.as_view(), name="platform-white-label-list"),
    path(
        "platform/white-label/<uuid:business_id>",
        PlatformWhiteLabelDetailView.as_view(),
        name="platform-white-label-detail",
    ),
    path("platform/tenants", PlatformTenantAdminListView.as_view(), name="platform-tenant-admin-list"),
    path(
        "platform/tenants/<uuid:tenant_id>",
        PlatformTenantAdminDetailView.as_view(),
        name="platform-tenant-admin-detail",
    ),
]
