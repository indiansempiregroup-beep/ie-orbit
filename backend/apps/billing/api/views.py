from __future__ import annotations

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.api.serializers import BillingCheckoutSerializer
from apps.billing.services.checkout import CheckoutService
from apps.billing.services.webhooks import WebhookService
from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.tenancy.models import Tenant


class BillingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Billing"], description="Razorpay billing configuration status.")
    def get(self, request: Request) -> Response:
        return success_response(
            CheckoutService().get_status(),
            request_id=getattr(request, "request_id", None),
        )


class BillingCheckoutView(APIView):
    permission_classes = [IsAuthenticated, BusinessAccessPermission]

    @extend_schema(
        tags=["Billing"],
        request=BillingCheckoutSerializer,
        description="Create a Razorpay checkout order for a product plan.",
    )
    def post(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = BillingCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        business_id = request.headers.get("X-Business-ID") or request.data.get("business_id")
        if not business_id:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"business_id": "Business context is required."})

        business = Business.objects.get(id=business_id, tenant=tenant)
        checkout = CheckoutService().create_checkout_session(
            tenant=tenant,
            business=business,
            product_code=serializer.validated_data["product_code"],
            plan_code=serializer.validated_data["plan_code"],
            actor_id=str(request.user.id),
        )
        return success_response(
            checkout,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


@method_decorator(csrf_exempt, name="dispatch")
class RazorpayWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Billing"], description="Razorpay payment webhook endpoint.")
    def post(self, request: Request) -> Response:
        signature = request.headers.get("X-Razorpay-Signature", "")
        result = WebhookService().process_razorpay_webhook(
            body=request.body,
            signature=signature,
        )
        if not result.get("accepted"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return success_response(result, request_id=getattr(request, "request_id", None))
