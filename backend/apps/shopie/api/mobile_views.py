from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api.mobile_helpers import ensure_customer_for_user
from apps.api.mobile_serializers import MobileDiscoverQuerySerializer
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.shopie.api.serializers import ShopOrderSerializer, ShopProductSerializer
from apps.shopie.models import FulfillmentMode, ProductStatus, ShopProduct
from apps.shopie.services import CatalogService, OrderService
from apps.tenancy.models import Tenant


def _resolve_tenant_business(*, tenant_slug: str, business_code: str) -> tuple[Tenant, Business]:
    tenant = Tenant.objects.filter(slug=tenant_slug).first()
    if not tenant:
        raise ValueError("Tenant not found.")
    business = Business.objects.filter(tenant=tenant, business_code=business_code).first()
    if not business:
        raise ValueError("Business not found.")
    return tenant, business


class MobileShopProductListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    catalog = CatalogService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        products = self.catalog.list_products(
            tenant=tenant,
            business=business,
            search=request.query_params.get("search"),
            status=ProductStatus.ACTIVE,
        )
        return success_response(ShopProductSerializer(products[:100], many=True).data)


class MobileShopProductDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    catalog = CatalogService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, product_id) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
            product = self.catalog.get_product(tenant=tenant, business=business, product_id=product_id)
        except (ValueError, ShopProduct.DoesNotExist) as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(ShopProductSerializer(product).data)


class MobileShopOrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        qs = self.orders.list_orders(
            tenant=tenant, business=business, customer_id=customer.id
        )
        return success_response(ShopOrderSerializer(qs[:50], many=True).data)

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        scope = MobileDiscoverQuerySerializer(
            data={
                "tenant_slug": request.data.get("tenant_slug"),
                "business_code": request.data.get("business_code"),
            }
        )
        scope.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=scope.validated_data["tenant_slug"],
                business_code=scope.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        lines = request.data.get("lines") or []
        try:
            order = self.orders.create_order(
                tenant=tenant,
                business=business,
                customer=customer,
                lines=lines,
                fulfillment_mode=request.data.get("fulfillment_mode") or FulfillmentMode.PICKUP,
                notes=str(request.data.get("notes") or ""),
                delivery_address=str(request.data.get("delivery_address") or ""),
                delivery_city=str(request.data.get("delivery_city") or ""),
                delivery_postal_code=str(request.data.get("delivery_postal_code") or ""),
                confirm=False,
            )
        except (DjangoValidationError, ShopProduct.DoesNotExist) as exc:
            if isinstance(exc, DjangoValidationError) and hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(ShopOrderSerializer(order).data, status_code=status.HTTP_201_CREATED)


class MobileShopOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, order_id) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
            order = self.orders.get_order(tenant=tenant, business=business, order_id=order_id)
        except Exception as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        if order.customer_id != customer.id and not getattr(request.user, "is_superuser", False):
            return Response({"error": {"message": "Not found."}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(ShopOrderSerializer(order).data)
