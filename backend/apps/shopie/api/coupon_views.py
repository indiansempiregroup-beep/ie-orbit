from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.constants import FEATURE_SHOPIE_COUPONS, FEATURE_SHOPIE_POS
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.customers.models import Customer
from apps.shopie.api.access import require_business as _business
from apps.shopie.api.access import require_shopie_feature
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    ShopCouponPatchSerializer,
    ShopCouponSerializer,
    ShopCouponWriteSerializer,
)
from apps.shopie.models import ShopCoupon, ShopPet
from apps.shopie.services.coupons import CouponService


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError(exc.messages)
    return ValidationError(str(exc))


class ShopCheckoutEligibleOffersView(APIView):
    """POS/online: coupons + automation offers for the selected customer."""

    permission_classes = [ShopAccessPermission]
    coupons = CouponService()

    def post(self, request: Request) -> Response:
        data = request.data or {}
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_POS)
        customer = None
        customer_id = data.get("customer_id")
        if customer_id:
            customer = Customer.objects.filter(
                tenant=request.current_tenant, business=business, id=customer_id
            ).first()
            if customer is None:
                raise NotFound("Customer not found.")
        pet = None
        pet_id = data.get("pet_id")
        if pet_id:
            pet = ShopPet.objects.filter(
                tenant=request.current_tenant, business=business, id=pet_id
            ).first()
        lines = data.get("lines") if isinstance(data.get("lines"), list) else []
        fulfillment_mode = str(data.get("fulfillment_mode") or "pos").strip().lower()
        payload = self.coupons.eligible_offers(
            tenant=request.current_tenant,
            business=business,
            lines=lines,
            fulfillment_mode=fulfillment_mode,
            customer=customer,
            pet=pet,
        )
        return success_response(payload)


class ShopCouponListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    coupons = CouponService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_COUPONS)
        active_only = str(request.query_params.get("active_only") or "").lower() in {
            "1",
            "true",
            "yes",
        }
        qs = self.coupons.list_coupons(
            tenant=request.current_tenant,
            business=business,
            active_only=active_only,
        )
        return paginated_list_response(request, qs, ShopCouponSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopCouponWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data.pop("business_id"), feature=FEATURE_SHOPIE_COUPONS)
        try:
            coupon = self.coupons.create_coupon(
                tenant=request.current_tenant, business=business, data=data
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopCouponSerializer(coupon).data, status_code=status.HTTP_201_CREATED
        )


class ShopCouponDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    coupons = CouponService()

    def _get(self, request: Request, coupon_id) -> ShopCoupon:
        coupon = ShopCoupon.objects.filter(tenant=request.current_tenant, id=coupon_id).first()
        if not coupon:
            raise NotFound("Coupon not found.")
        require_shopie_feature(coupon.business, FEATURE_SHOPIE_COUPONS)
        return coupon

    def get(self, request: Request, coupon_id) -> Response:
        return success_response(ShopCouponSerializer(self._get(request, coupon_id)).data)

    def patch(self, request: Request, coupon_id) -> Response:
        coupon = self._get(request, coupon_id)
        serializer = ShopCouponPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("business_id", None)
        try:
            coupon = self.coupons.update_coupon(coupon=coupon, data=data)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopCouponSerializer(coupon).data)

    def delete(self, request: Request, coupon_id) -> Response:
        coupon = self._get(request, coupon_id)
        self.coupons.delete_coupon(coupon=coupon)
        return success_response({"deleted": True})
