from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.constants import FEATURE_SHOPIE_INSTANT_DELIVERY, FEATURE_SHOPIE_ORDERS
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.shopie.api.access import require_any_shopie_feature, require_business
from apps.shopie.api.mobile_views import _scope_from_request, ensure_customer_for_user
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    ShopDeliveryQuoteSerializer,
    ShopDeliverySettingsPatchSerializer,
    ShopOrderSerializer,
)
from apps.shopie.models import ShopOrder, ShopProduct
from apps.shopie.services.delivery import DeliveryService
from apps.shopie.services.fulfillment import FulfillmentService


def _api_validation(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError({"detail": str(exc)})


def _quote_source(*, tenant, business: Business, data: dict):
    requested = data.get("lines") or []
    if not requested:
        return None
    products = {
        str(product.id): product
        for product in ShopProduct.objects.filter(
            tenant=tenant,
            business=business,
            id__in=[line["product_id"] for line in requested],
        )
    }
    if len(products) != len({str(line["product_id"]) for line in requested}):
        raise ValidationError({"lines": "One or more products are unavailable."})
    lines = []
    for line in requested:
        product = products[str(line["product_id"])]
        quantity = line["quantity"]
        lines.append(
            SimpleNamespace(
                product_id=product.id,
                product_name=product.name,
                quantity=quantity,
                line_total=(product.price * quantity).quantize(Decimal("0.01")),
            )
        )
    return FulfillmentService().select_source_office(
        tenant=tenant,
        business=business,
        lines=lines,
        drop_latitude=data["latitude"],
        drop_longitude=data["longitude"],
    )


class ShopDeliverySettingsView(APIView):
    permission_classes = [ShopAccessPermission]
    delivery = DeliveryService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = require_business(
            request,
            business_id,
            feature=FEATURE_SHOPIE_INSTANT_DELIVERY,
        )
        settings = self.delivery.ensure_settings(
            tenant=request.current_tenant,
            business=business,
        )
        return success_response(self.delivery.public_settings(settings))

    def patch(self, request: Request) -> Response:
        serializer = ShopDeliverySettingsPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = require_business(
            request,
            data["business_id"],
            feature=FEATURE_SHOPIE_INSTANT_DELIVERY,
        )
        try:
            settings = self.delivery.update_settings(
                tenant=request.current_tenant,
                business=business,
                enabled=data.get("instant_delivery_enabled"),
                incoming=dict(data.get("delivery_integration") or {}),
            )
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        return success_response(self.delivery.public_settings(settings))


class ShopDeliveryQuoteView(APIView):
    permission_classes = [ShopAccessPermission]
    delivery = DeliveryService()

    def post(self, request: Request) -> Response:
        serializer = ShopDeliveryQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = require_business(
            request,
            data["business_id"],
            feature=FEATURE_SHOPIE_INSTANT_DELIVERY,
        )
        source = _quote_source(tenant=request.current_tenant, business=business, data=data)
        try:
            result = self.delivery.quote(
                tenant=request.current_tenant,
                business=business,
                drop={
                    "latitude": data["latitude"],
                    "longitude": data["longitude"],
                    "address": data.get("address") or "",
                    "city": data.get("city") or "",
                    "state": data.get("state") or "",
                    "postal_code": data.get("postal_code") or "",
                },
                subtotal=Decimal(data["subtotal"]),
                branch=source.branch if source else None,
                pickup_source=source.location if source else None,
            )
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        return success_response(result)


class ShopOrderDispatchView(APIView):
    permission_classes = [ShopAccessPermission]
    delivery = DeliveryService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(
            ShopOrder.objects.select_related("business", "customer"),
            tenant=request.current_tenant,
            id=order_id,
        )
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_INSTANT_DELIVERY,))
        try:
            order = self.delivery.dispatch(order=order)
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        return success_response(ShopOrderSerializer(order).data)


class ShopOrderDeliverySimulateView(APIView):
    """Step a mock delivery forward without a partner webhook."""

    permission_classes = [ShopAccessPermission]
    delivery = DeliveryService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(
            ShopOrder.objects.select_related("business", "customer", "tenant"),
            tenant=request.current_tenant,
            id=order_id,
        )
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_INSTANT_DELIVERY,))
        try:
            order = self.delivery.simulate_tracking(
                order=order,
                status=str(request.data.get("partner_status") or ""),
            )
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        return success_response(self.delivery.live_payload(order=order))


class ShopOrderDeliveryLiveView(APIView):
    permission_classes = [ShopAccessPermission]
    delivery = DeliveryService()

    def get(self, request: Request, order_id) -> Response:
        order = get_object_or_404(
            ShopOrder.objects.select_related("business", "tenant"),
            tenant=request.current_tenant,
            id=order_id,
        )
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        refresh = str(request.query_params.get("refresh") or "").lower() in {"1", "true", "yes"}
        try:
            return success_response(self.delivery.live_payload(order=order, refresh=refresh))
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc


class MobileShopDeliveryQuoteView(APIView):
    permission_classes = [IsAuthenticated]
    delivery = DeliveryService()

    def post(self, request: Request) -> Response:
        serializer = ShopDeliveryQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        source = _quote_source(tenant=tenant, business=business, data=data)
        try:
            result = self.delivery.quote(
                tenant=tenant,
                business=business,
                drop={
                    "latitude": data["latitude"],
                    "longitude": data["longitude"],
                    "address": data.get("address") or "",
                    "city": data.get("city") or "",
                    "state": data.get("state") or "",
                    "postal_code": data.get("postal_code") or "",
                },
                subtotal=Decimal(data["subtotal"]),
                customer_name=customer.display_name,
                customer_phone=customer.phone_number,
                branch=source.branch if source else None,
                pickup_source=source.location if source else None,
            )
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        return success_response(result)


class MobileShopOrderDeliveryLiveView(APIView):
    permission_classes = [IsAuthenticated]
    delivery = DeliveryService()

    def get(self, request: Request, order_id) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        order = get_object_or_404(
            ShopOrder.objects.select_related("business", "tenant"),
            tenant=tenant,
            business=business,
            customer=customer,
            id=order_id,
        )
        refresh = str(request.query_params.get("refresh", "true")).lower() in {
            "1",
            "true",
            "yes",
        }
        try:
            return success_response(self.delivery.live_payload(order=order, refresh=refresh))
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc


class ShopDeliveryWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    delivery = DeliveryService()

    def post(self, request: Request, provider: str, business_id) -> Response:
        business = get_object_or_404(
            Business.all_objects.select_related("tenant"),
            id=business_id,
        )
        result = self.delivery.process_webhook(
            provider=provider,
            business=business,
            body=request.body,
            signature=str(
                request.headers.get("X-Delivery-Signature")
                or request.headers.get("X-Webhook-Signature")
                or ""
            ),
            external_event_id=str(request.headers.get("X-Event-Id") or ""),
        )
        return Response(result, status=200 if result.get("accepted") else 401)
