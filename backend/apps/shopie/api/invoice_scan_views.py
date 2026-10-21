from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.constants import FEATURE_SHOPIE_BOOKS_PURCHASE, FEATURE_SHOPIE_INVOICE_SCAN
from apps.common.api.responses import success_response
from apps.shopie.api.access import require_business, require_shopie_feature
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import ShopBooksVoucherSerializer, ShopInvoiceScanAnalyzeSerializer, ShopInvoiceScanConfirmSerializer
from apps.shopie.models import ShopBooksVoucher
from apps.shopie.services.invoice_scan import InvoiceScanService


class ShopInvoiceScanAnalyzeView(APIView):
    permission_classes = [ShopAccessPermission]
    service = InvoiceScanService()

    def post(self, request: Request) -> Response:
        serializer = ShopInvoiceScanAnalyzeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = require_business(request, data["business_id"], feature=FEATURE_SHOPIE_INVOICE_SCAN)
        result = self.service.analyze(
            tenant=request.current_tenant,
            business=business,
            image_urls=list(data["image_urls"]),
        )
        return success_response(result)


class ShopInvoiceScanConfirmView(APIView):
    permission_classes = [ShopAccessPermission]
    service = InvoiceScanService()

    def post(self, request: Request) -> Response:
        serializer = ShopInvoiceScanConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = require_business(request, data["business_id"], feature=FEATURE_SHOPIE_INVOICE_SCAN)
        require_shopie_feature(business, FEATURE_SHOPIE_BOOKS_PURCHASE)
        try:
            posted = self.service.confirm(
                tenant=request.current_tenant,
                business=business,
                draft=data["draft"],
                create_missing=bool(data.get("create_missing", True)),
                create_supplier=bool(data.get("create_supplier", False)),
                amount_paid=data.get("amount_paid") or "0",
                cash_account_id=str(data["cash_account_id"]) if data.get("cash_account_id") else None,
                godown_id=str(data["godown_id"]) if data.get("godown_id") else None,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        voucher = ShopBooksVoucher.objects.get(tenant=request.current_tenant, id=posted["voucher_id"])
        return success_response(
            {
                **posted,
                "voucher": ShopBooksVoucherSerializer(voucher).data,
            },
            status_code=status.HTTP_201_CREATED,
        )
