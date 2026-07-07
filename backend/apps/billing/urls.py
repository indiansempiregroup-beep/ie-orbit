from django.urls import path

from apps.billing.api.views import (
    BillingCheckoutView,
    BillingGoLiveCheckView,
    BillingReleaseGateView,
    BillingStatusView,
    BillingReconciliationRunView,
    BillingWebhookBulkReprocessView,
    BillingWebhookEventListView,
    BillingWebhookEventReprocessView,
    BillingWebhookSummaryView,
    RazorpayWebhookView,
)

urlpatterns = [
    path("billing/status", BillingStatusView.as_view(), name="billing-status"),
    path("billing/go-live-check", BillingGoLiveCheckView.as_view(), name="billing-go-live-check"),
    path("billing/release-gate", BillingReleaseGateView.as_view(), name="billing-release-gate"),
    path(
        "billing/reconciliation/run",
        BillingReconciliationRunView.as_view(),
        name="billing-reconciliation-run",
    ),
    path("billing/checkout", BillingCheckoutView.as_view(), name="billing-checkout"),
    path("billing/webhooks/summary", BillingWebhookSummaryView.as_view(), name="billing-webhook-summary"),
    path(
        "billing/webhooks/reprocess-bulk",
        BillingWebhookBulkReprocessView.as_view(),
        name="billing-webhook-bulk-reprocess",
    ),
    path("billing/webhooks/events", BillingWebhookEventListView.as_view(), name="billing-webhook-events"),
    path(
        "billing/webhooks/events/<uuid:event_id>/reprocess",
        BillingWebhookEventReprocessView.as_view(),
        name="billing-webhook-reprocess",
    ),
    path(
        "billing/webhooks/razorpay",
        RazorpayWebhookView.as_view(),
        name="billing-razorpay-webhook",
    ),
]
