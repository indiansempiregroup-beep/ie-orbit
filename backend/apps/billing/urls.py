from django.urls import path

from apps.billing.api.views import BillingCheckoutView, BillingStatusView, RazorpayWebhookView

urlpatterns = [
    path("billing/status", BillingStatusView.as_view(), name="billing-status"),
    path("billing/checkout", BillingCheckoutView.as_view(), name="billing-checkout"),
    path(
        "billing/webhooks/razorpay",
        RazorpayWebhookView.as_view(),
        name="billing-razorpay-webhook",
    ),
]
