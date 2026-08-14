from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.constants import FEATURE_SHOPIE_EINVOICE, FEATURE_SHOPIE_EWAY
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.shopie.api.access import require_business as _business, require_shopie_feature
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    ShopComplianceSettingsPatchSerializer,
    ShopComplianceSettingsSerializer,
    ShopEInvoiceCancelSerializer,
    ShopEInvoiceGenerateSerializer,
    ShopEInvoiceSerializer,
    ShopEWayBillSerializer,
    ShopEWayCancelSerializer,
    ShopEWayGenerateSerializer,
)
from apps.shopie.models import ShopBooksVoucher, ShopEWayBill
from apps.shopie.services.einvoice.service import GstComplianceService


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError({"detail": list(exc.messages) if hasattr(exc, "messages") else str(exc)})


def _voucher(request: Request, voucher_id) -> ShopBooksVoucher:
    return get_object_or_404(ShopBooksVoucher, tenant=request.current_tenant, id=voucher_id)


class ShopComplianceSettingsView(APIView):
    permission_classes = [ShopAccessPermission]
    compliance = GstComplianceService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(
            request, business_id, features=(FEATURE_SHOPIE_EINVOICE, FEATURE_SHOPIE_EWAY)
        )
        settings = self.compliance.get_or_create_settings(
            tenant=request.current_tenant, business=business
        )
        return success_response(ShopComplianceSettingsSerializer(settings).data)

    def patch(self, request: Request) -> Response:
        serializer = ShopComplianceSettingsPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        business = _business(
            request, data.pop("business_id"), features=(FEATURE_SHOPIE_EINVOICE, FEATURE_SHOPIE_EWAY)
        )
        try:
            settings = self.compliance.update_compliance_settings(
                tenant=request.current_tenant, business=business, data=data
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopComplianceSettingsSerializer(settings).data)


class ShopVoucherEInvoiceView(APIView):
    permission_classes = [ShopAccessPermission]
    compliance = GstComplianceService()

    def get(self, request: Request, voucher_id) -> Response:
        voucher = _voucher(request, voucher_id)
        require_shopie_feature(voucher.business, FEATURE_SHOPIE_EINVOICE)
        einvoice = self.compliance.get_einvoice_for_voucher(
            tenant=request.current_tenant, business=voucher.business, voucher_id=voucher.id
        )
        if einvoice is None:
            raise NotFound("No e-invoice found for this voucher.")
        return success_response(ShopEInvoiceSerializer(einvoice).data)

    def post(self, request: Request, voucher_id) -> Response:
        voucher = _voucher(request, voucher_id)
        require_shopie_feature(voucher.business, FEATURE_SHOPIE_EINVOICE)
        serializer = ShopEInvoiceGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            einvoice = self.compliance.generate_einvoice(
                tenant=request.current_tenant,
                business=voucher.business,
                voucher_id=voucher.id,
                allow_b2c=serializer.validated_data.get("allow_b2c", False),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopEInvoiceSerializer(einvoice).data, status_code=status.HTTP_201_CREATED
        )


class ShopVoucherEInvoiceCancelView(APIView):
    permission_classes = [ShopAccessPermission]
    compliance = GstComplianceService()

    def post(self, request: Request, voucher_id) -> Response:
        voucher = _voucher(request, voucher_id)
        require_shopie_feature(voucher.business, FEATURE_SHOPIE_EINVOICE)
        serializer = ShopEInvoiceCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            einvoice = self.compliance.cancel_einvoice(
                tenant=request.current_tenant,
                business=voucher.business,
                voucher_id=voucher.id,
                reason=serializer.validated_data["reason"],
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopEInvoiceSerializer(einvoice).data)


class ShopVoucherEWayView(APIView):
    permission_classes = [ShopAccessPermission]
    compliance = GstComplianceService()

    def post(self, request: Request, voucher_id) -> Response:
        voucher = _voucher(request, voucher_id)
        require_shopie_feature(voucher.business, FEATURE_SHOPIE_EWAY)
        serializer = ShopEWayGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            eway = self.compliance.generate_eway(
                tenant=request.current_tenant,
                business=voucher.business,
                voucher_id=voucher.id,
                transport=dict(serializer.validated_data),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopEWayBillSerializer(eway).data, status_code=status.HTTP_201_CREATED
        )


class ShopEWayCancelView(APIView):
    permission_classes = [ShopAccessPermission]
    compliance = GstComplianceService()

    def post(self, request: Request, eway_id) -> Response:
        eway = get_object_or_404(ShopEWayBill, tenant=request.current_tenant, id=eway_id)
        require_shopie_feature(eway.business, FEATURE_SHOPIE_EWAY)
        serializer = ShopEWayCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            eway = self.compliance.cancel_eway(
                tenant=request.current_tenant,
                business=eway.business,
                eway_id=eway.id,
                reason=serializer.validated_data["reason"],
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopEWayBillSerializer(eway).data)


class ShopEWayListView(APIView):
    permission_classes = [ShopAccessPermission]
    compliance = GstComplianceService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_EWAY)
        qs = self.compliance.list_eway_bills(
            tenant=request.current_tenant,
            business=business,
            voucher_id=request.query_params.get("voucher_id") or None,
            status=request.query_params.get("status") or None,
        )
        return paginated_list_response(request, qs, ShopEWayBillSerializer)
