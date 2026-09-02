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
    ShopOrderShipSerializer,
    ShopOrderShipmentPatchSerializer,
)
from apps.shopie.models import OrderStatus, ShopOrder, ShopProduct
from apps.shopie.services.delivery import DeliveryService
from apps.shopie.services.fulfillment import FulfillmentService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.shipment import ShipmentService
from apps.shopie.services.shiprocket_standard import ShiprocketStandardService


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
            if data.get("courier_integration") is not None:
                settings = self.delivery.update_courier_settings(
                    tenant=request.current_tenant,
                    business=business,
                    incoming=dict(data["courier_integration"]),
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
            ShopOrder.objects.select_related("business", "tenant").prefetch_related("shipment"),
            tenant=request.current_tenant,
            id=order_id,
        )
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        refresh = str(request.query_params.get("refresh") or "").lower() in {"1", "true", "yes"}
        try:
            return success_response(self.delivery.live_payload(order=order, refresh=refresh))
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc


class ShopOrderShipView(APIView):
    permission_classes = [ShopAccessPermission]
    shipments = ShipmentService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(
            ShopOrder.objects.select_related("business", "customer", "tenant"),
            tenant=request.current_tenant,
            id=order_id,
        )
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        serializer = ShopOrderShipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            shipment = self.shipments.ship_order(
                tenant=request.current_tenant,
                business=order.business,
                order=order,
                carrier=data["carrier"],
                tracking_number=data["tracking_number"],
                carrier_label_override=data.get("carrier_label") or "",
                tracking_url_override=data.get("tracking_url") or "",
                estimated_delivery_at=self.shipments.parse_estimated_delivery(
                    data.get("estimated_delivery_at")
                ),
                notify_customer=bool(data.get("notify_customer", True)),
            )
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        order = ShopOrder.objects.select_related("business", "customer").prefetch_related(
            "shipment"
        ).get(id=order.id)
        return success_response(
            {
                "order": ShopOrderSerializer(order).data,
                "shipment": self.shipments.serialize(shipment),
            }
        )


class ShopOrderShiprocketView(APIView):
    permission_classes = [ShopAccessPermission]
    shiprocket = ShiprocketStandardService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(
            ShopOrder.objects.select_related("business", "customer", "tenant"),
            tenant=request.current_tenant,
            id=order_id,
        )
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        notify_customer = bool(request.data.get("notify_customer", True))
        try:
            shipment = self.shiprocket.book_order(order=order, notify_customer=notify_customer)
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        shipments = ShipmentService()
        order = ShopOrder.objects.select_related("business", "customer").prefetch_related(
            "shipment"
        ).get(id=order.id)
        return success_response(
            {
                "order": ShopOrderSerializer(order).data,
                "shipment": shipments.serialize(shipment),
            }
        )


class ShopCourierWebhookView(APIView):
    """Shiprocket standard shipment status updates (no HMAC required)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    shiprocket = ShiprocketStandardService()

    def post(self, request: Request, business_id) -> Response:
        business = get_object_or_404(
            Business.all_objects.select_related("tenant"),
            id=business_id,
        )
        result = self.shiprocket.process_webhook(business=business, body=request.body)
        return Response(result, status=200)


class ShopOrderShipmentView(APIView):
    permission_classes = [ShopAccessPermission]
    shipments = ShipmentService()
    orders = OrderService()

    def patch(self, request: Request, order_id) -> Response:
        order = get_object_or_404(
            ShopOrder.objects.select_related("business", "tenant").prefetch_related("shipment"),
            tenant=request.current_tenant,
            id=order_id,
        )
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        serializer = ShopOrderShipmentPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shipment = None
        try:
            if data.get("status"):
                shipment = self.shipments.update_milestone(
                    order=order,
                    status=data["status"],
                    notify_customer=bool(data.get("notify_customer", True)),
                )
                if data["status"] == "delivered":
                    self.orders.transition(
                        tenant=request.current_tenant,
                        business=order.business,
                        order=order,
                        status=OrderStatus.COMPLETED,
                        notify=False,
                    )
            else:
                shipment = self.shipments.get_shipment(order=order)
                if shipment is None:
                    raise DjangoValidationError({"shipment": "No shipment found."})
        except DjangoValidationError as exc:
            raise _api_validation(exc) from exc
        order = ShopOrder.objects.select_related("business").prefetch_related("shipment").get(
            id=order.id
        )
        return success_response(
            {
                "order": ShopOrderSerializer(order).data,
                "shipment": self.shipments.serialize(shipment),
            }
        )


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
            from apps.customers.services.contact import resolve_customer_phone

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
                    "contact": {
                        "name": customer.display_name,
                        "phone": resolve_customer_phone(customer),
                    },
                },
                subtotal=Decimal(data["subtotal"]),
                customer_name=customer.display_name,
                customer_phone=resolve_customer_phone(customer),
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
            ShopOrder.objects.select_related("business", "tenant").prefetch_related("shipment"),
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
