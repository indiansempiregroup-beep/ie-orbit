from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.constants import FEATURE_SHOPIE_CUSTOMER_REFERRAL, FEATURE_SHOPIE_GROW_ADS
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.customers.models import Customer
from apps.shopie.api.access import require_business as _business, require_shopie_feature
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    CustomerReferralCodeSerializer,
    CustomerReferralSerializer,
    ShopDashboardAdPatchSerializer,
    ShopDashboardAdSerializer,
    ShopDashboardAdWriteSerializer,
)
from apps.shopie.models import ShopDashboardAd
from apps.shopie.services.ads import DashboardAdService
from apps.shopie.services.referrals import CustomerReferralService


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError(exc.messages)
    return ValidationError(str(exc))


class ShopDashboardAdListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    ads = DashboardAdService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_GROW_ADS)
        active_only = str(request.query_params.get("active_only") or "").lower() in {
            "1",
            "true",
            "yes",
        }
        qs = self.ads.list_ads(
            tenant=request.current_tenant,
            business=business,
            active_only=active_only,
        )
        return paginated_list_response(request, qs, ShopDashboardAdSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopDashboardAdWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data.pop("business_id"), feature=FEATURE_SHOPIE_GROW_ADS)
        try:
            ad = self.ads.create_ad(tenant=request.current_tenant, business=business, data=data)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopDashboardAdSerializer(ad).data, status_code=status.HTTP_201_CREATED
        )


class ShopDashboardAdDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    ads = DashboardAdService()

    def _get(self, request: Request, ad_id) -> ShopDashboardAd:
        ad = (
            ShopDashboardAd.objects.select_related("media")
            .filter(tenant=request.current_tenant, id=ad_id)
            .first()
        )
        if not ad:
            raise NotFound("Dashboard ad not found.")
        require_shopie_feature(ad.business, FEATURE_SHOPIE_GROW_ADS)
        return ad

    def get(self, request: Request, ad_id) -> Response:
        return success_response(ShopDashboardAdSerializer(self._get(request, ad_id)).data)

    def patch(self, request: Request, ad_id) -> Response:
        ad = self._get(request, ad_id)
        serializer = ShopDashboardAdPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("business_id", None)
        try:
            ad = self.ads.update_ad(ad=ad, data=data)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopDashboardAdSerializer(ad).data)

    def delete(self, request: Request, ad_id) -> Response:
        ad = self._get(request, ad_id)
        self.ads.delete_ad(ad=ad)
        return success_response({"deleted": True})


class ShopCustomerReferralListView(APIView):
    permission_classes = [ShopAccessPermission]
    referrals = CustomerReferralService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_CUSTOMER_REFERRAL)
        qs = self.referrals.list_referrals(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, CustomerReferralSerializer)


class ShopCustomerReferralCodeMineView(APIView):
    permission_classes = [ShopAccessPermission]
    referrals = CustomerReferralService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        customer_id = request.query_params.get("customer_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        if not customer_id:
            raise ValidationError({"customer_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_CUSTOMER_REFERRAL)
        customer = get_object_or_404(
            Customer, tenant=request.current_tenant, business=business, id=customer_id
        )
        try:
            row = self.referrals.get_or_create_code(
                tenant=request.current_tenant, business=business, customer=customer
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(CustomerReferralCodeSerializer(row).data)

    def post(self, request: Request) -> Response:
        business_id = request.data.get("business_id")
        customer_id = request.data.get("customer_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        if not customer_id:
            raise ValidationError({"customer_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_CUSTOMER_REFERRAL)
        customer = get_object_or_404(
            Customer, tenant=request.current_tenant, business=business, id=customer_id
        )
        try:
            row = self.referrals.get_or_create_code(
                tenant=request.current_tenant,
                business=business,
                customer=customer,
                code=request.data.get("code"),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            CustomerReferralCodeSerializer(row).data, status_code=status.HTTP_201_CREATED
        )
