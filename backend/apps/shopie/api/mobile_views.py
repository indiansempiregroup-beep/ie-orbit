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
from apps.common.upi import build_upi_pay_url
from apps.platform_media.models import MediaFolderType, MediaVisibility
from apps.platform_media.services import MediaService
from apps.shopie.api.serializers import (
    ShopOrderSerializer,
    ShopPetSerializer,
    ShopProductSerializer,
    ShopReturnSerializer,
)
from apps.shopie.models import FulfillmentMode, ProductStatus, ShopPet, ShopProduct, ShopReturn
from apps.shopie.services import CatalogService, OrderService
from apps.shopie.services.pets import PetsService
from apps.shopie.services.returns import ReturnService
from apps.shopie.services.zones import DeliveryZoneService
from apps.tenancy.models import Tenant


def _resolve_tenant_business(*, tenant_slug: str, business_code: str) -> tuple[Tenant, Business]:
    tenant = Tenant.objects.filter(slug=tenant_slug).first()
    if not tenant:
        raise ValueError("Tenant not found.")
    business = Business.objects.filter(tenant=tenant, business_code=business_code).first()
    if not business:
        raise ValueError("Business not found.")
    return tenant, business


def _scope_from_request(request: Request) -> tuple[Tenant, Business]:
    serializer = MobileDiscoverQuerySerializer(
        data={
            "tenant_slug": request.query_params.get("tenant_slug") or request.data.get("tenant_slug"),
            "business_code": request.query_params.get("business_code") or request.data.get("business_code"),
        }
    )
    serializer.is_valid(raise_exception=True)
    return _resolve_tenant_business(
        tenant_slug=serializer.validated_data["tenant_slug"],
        business_code=serializer.validated_data["business_code"],
    )


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
        category = request.query_params.get("category") or None
        products = self.catalog.list_products(
            tenant=tenant,
            business=business,
            search=request.query_params.get("search"),
            status=ProductStatus.ACTIVE,
            category=category,
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
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        qs = self.orders.list_orders(tenant=tenant, business=business, customer_id=customer.id)
        return success_response(ShopOrderSerializer(qs[:50], many=True).data)

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
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
                payment_method=str(request.data.get("payment_method") or "cash"),
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

    def _owned_order(self, request: Request, order_id):
        tenant, business = _scope_from_request(request)
        order = self.orders.get_order(tenant=tenant, business=business, order_id=order_id)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        if order.customer_id != customer.id and not getattr(request.user, "is_superuser", False):
            raise LookupError("Not found.")
        return tenant, business, customer, order

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, order_id) -> Response:
        try:
            _, _, _, order = self._owned_order(request, order_id)
        except (ValueError, LookupError, ShopProduct.DoesNotExist, Exception) as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(ShopOrderSerializer(order).data)


class MobileShopOrderCancelView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request, order_id) -> Response:
        detail = MobileShopOrderDetailView()
        try:
            tenant, business, _, order = detail._owned_order(request, order_id)
        except Exception as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        try:
            order = self.orders.cancel_customer_order(tenant=tenant, business=business, order=order)
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(ShopOrderSerializer(order).data)


class MobileShopOrderClaimPaymentView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request, order_id) -> Response:
        detail = MobileShopOrderDetailView()
        try:
            tenant, business, _, order = detail._owned_order(request, order_id)
        except Exception as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        try:
            order = self.orders.claim_payment(
                tenant=tenant,
                business=business,
                order=order,
                upi_utr=str(request.data.get("upi_utr") or ""),
                payment_proof_url=str(request.data.get("payment_proof_url") or ""),
            )
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(ShopOrderSerializer(order).data)


class MobileShopOrderPaymentProofView(APIView):
    permission_classes = [IsAuthenticated]
    media_service = MediaService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request, order_id) -> Response:
        detail = MobileShopOrderDetailView()
        try:
            tenant, business, _, order = detail._owned_order(request, order_id)
        except Exception as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        uploaded = request.FILES.get("file")
        if uploaded is None:
            raise ValidationError({"file": "Payment screenshot is required."})
        result = self.media_service.upload(
            uploaded_file=uploaded,
            tenant=tenant,
            business=business,
            uploaded_by=request.user,
            folder_type=MediaFolderType.DOCUMENTS,
            visibility=MediaVisibility.PRIVATE,
            tags=["shop_payment_proof", str(order.id)],
            display_name=f"Payment proof {order.order_number}",
        )
        public_url = str(result.media.metadata.get("public_url") or "")
        return success_response(
            {
                "payment_proof_url": public_url,
                "media_id": str(result.media.id),
                "order_id": str(order.id),
            }
        )


class MobileShopDeliveryZoneMatchView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    zones = DeliveryZoneService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        zone = self.zones.match_zone(
            tenant=tenant,
            business=business,
            city=str(request.query_params.get("city") or ""),
            postal_code=str(request.query_params.get("postal_code") or ""),
        )
        if zone is None:
            return success_response({"matched": False, "zone": None})
        return success_response(
            {
                "matched": True,
                "zone": {
                    "id": str(zone.id),
                    "name": zone.name,
                    "fee": str(zone.fee),
                    "min_order_total": str(zone.min_order_total),
                    "same_day": zone.same_day,
                },
            }
        )


class MobileShopPetListView(APIView):
    permission_classes = [IsAuthenticated]
    pets = PetsService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        if not self.pets.has_pets_entitlement(business=business):
            return success_response([])
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            qs = self.pets.list_pets(tenant=tenant, business=business, customer_id=customer.id)
        except DjangoValidationError:
            return success_response([])
        return success_response(ShopPetSerializer(qs[:100], many=True).data)


class MobileShopPetDetailView(APIView):
    permission_classes = [IsAuthenticated]
    pets = PetsService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, pet_id) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        pet = (
            ShopPet.objects.filter(tenant=tenant, business=business, id=pet_id, customer_id=customer.id)
            .select_related("customer")
            .first()
        )
        if pet is None:
            return Response({"error": {"message": "Not found."}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(ShopPetSerializer(pet).data)


class MobileShopReturnListView(APIView):
    permission_classes = [IsAuthenticated]
    returns = ReturnService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        order_id = request.query_params.get("order_id") or None
        qs = self.returns.list_returns(
            tenant=tenant,
            business=business,
            customer_id=customer.id,
            order_id=order_id,
        )
        return success_response(ShopReturnSerializer(qs[:50], many=True).data)


class MobileShopReturnDetailView(APIView):
    permission_classes = [IsAuthenticated]
    returns = ReturnService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, return_id) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        shop_return = (
            ShopReturn.objects.filter(tenant=tenant, business=business, id=return_id, customer_id=customer.id)
            .select_related("order", "customer", "credit_invoice")
            .first()
        )
        if shop_return is None:
            return Response({"error": {"message": "Not found."}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(ShopReturnSerializer(shop_return).data)


class MobileUpiPreviewView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            _, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        amount = request.query_params.get("amount") or "0"
        note = str(request.query_params.get("note") or "")
        url = build_upi_pay_url(
            vpa=getattr(business, "upi_vpa", "") or "",
            payee_name=business.display_name,
            amount=amount,
            note=note,
            currency=business.currency or "INR",
        )
        return success_response(
            {
                "upi_vpa": getattr(business, "upi_vpa", "") or "",
                "payment_qr_url": getattr(business, "payment_qr_url", "") or "",
                "upi_pay_url": url,
            }
        )
