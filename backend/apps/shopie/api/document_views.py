from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.constants import FEATURE_SHOPIE_ORDERS, SHOPIE_BOOKS_FEATURES
from apps.common.api.responses import success_response
from apps.shopie.api.access import require_any_shopie_feature, require_business
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.models import ShopBooksVoucher
from apps.shopie.services.shop_documents import LAYOUT_A4, LAYOUT_THERMAL, ShopDocumentService

_DOC_FEATURES = (*SHOPIE_BOOKS_FEATURES, FEATURE_SHOPIE_ORDERS)


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError(list(exc.messages) if hasattr(exc, "messages") else str(exc))


class ShopDocumentDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    docs = ShopDocumentService()

    def get(self, request: Request, kind: str, document_id) -> Response:
        business_id = request.query_params.get("business_id") or request.headers.get("X-Business-ID")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = require_business(request, business_id, feature=None)
        require_any_shopie_feature(business, _DOC_FEATURES)
        try:
            payload = self.docs.build_payload(
                tenant=request.current_tenant,
                business=business,
                kind=kind,
                document_id=document_id,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        fmt = str(request.query_params.get("format") or "").lower()
        layout = str(request.query_params.get("layout") or LAYOUT_A4).lower()
        if fmt == "html":
            html = self.docs.render_html(payload, layout=layout)
            return HttpResponse(html, content_type="text/html; charset=utf-8")
        return success_response(payload)


class ShopDocumentPdfView(APIView):
    permission_classes = [ShopAccessPermission]
    docs = ShopDocumentService()

    def get(self, request: Request, kind: str, document_id) -> HttpResponse:
        business_id = request.query_params.get("business_id") or request.headers.get("X-Business-ID")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = require_business(request, business_id, feature=None)
        require_any_shopie_feature(business, _DOC_FEATURES)
        layout = str(request.query_params.get("layout") or LAYOUT_A4).lower()
        if layout not in {LAYOUT_A4, LAYOUT_THERMAL}:
            layout = LAYOUT_A4
        try:
            payload = self.docs.build_payload(
                tenant=request.current_tenant,
                business=business,
                kind=kind,
                document_id=document_id,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        pdf = self.docs.build_pdf(payload, layout=layout)
        filename = f"{payload.get('number') or document_id}.pdf".replace(" ", "_")
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ShopDocumentShareLinkView(APIView):
    permission_classes = [ShopAccessPermission]
    docs = ShopDocumentService()

    def post(self, request: Request, kind: str, document_id) -> Response:
        business_id = (
            request.data.get("business_id")
            or request.query_params.get("business_id")
            or request.headers.get("X-Business-ID")
        )
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = require_business(request, business_id, feature=None)
        require_any_shopie_feature(business, _DOC_FEATURES)
        try:
            link = self.docs.create_share_link(
                tenant=request.current_tenant,
                business=business,
                kind=kind,
                document_id=document_id,
                expires_days=int(request.data.get("expires_days") or 30),
                created_by_user_id=getattr(request.user, "id", None),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        public_url = self.docs.public_url_for(link)
        payload = self.docs.build_payload(
            tenant=request.current_tenant,
            business=business,
            kind=kind,
            document_id=document_id,
            public_url=public_url,
        )
        return success_response(
            {
                "token": link.token,
                "public_url": public_url,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
                "message": self.docs.share_message(payload),
                "customer_phone": payload.get("customer_phone") or "",
                "customer_email": payload.get("customer_email") or "",
                "total": payload.get("total"),
                "amount_paid": payload.get("amount_paid"),
                "amount_due": payload.get("amount_due"),
                "payment_method": payload.get("payment_method") or "",
                "payment_label": payload.get("payment_label") or "",
                "payment_status": payload.get("payment_status") or "",
            },
            status_code=status.HTTP_201_CREATED,
        )


class ShopDocumentSendView(APIView):
    permission_classes = [ShopAccessPermission]
    docs = ShopDocumentService()

    def post(self, request: Request, kind: str, document_id) -> Response:
        business_id = (
            request.data.get("business_id")
            or request.query_params.get("business_id")
            or request.headers.get("X-Business-ID")
        )
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = require_business(request, business_id, feature=None)
        require_any_shopie_feature(business, _DOC_FEATURES)
        channels = request.data.get("channels") or []
        if isinstance(channels, str):
            channels = [channels]
        if not channels:
            raise ValidationError({"channels": "Select at least one channel."})
        try:
            result = self.docs.send_document(
                tenant=request.current_tenant,
                business=business,
                kind=kind,
                document_id=document_id,
                channels=list(channels),
                to_phone=str(request.data.get("to_phone") or ""),
                to_email=str(request.data.get("to_email") or ""),
                remind_payment=bool(request.data.get("remind_payment")),
                user=request.user,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(result)


class PublicShopDocumentView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    docs = ShopDocumentService()

    def get(self, request: Request, token: str) -> HttpResponse | Response:
        try:
            link = self.docs.get_share_by_token(token)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        business = link.business
        self.docs.touch_share_view(link)
        public_url = self.docs.public_url_for(link)
        payload = self.docs.build_payload(
            tenant=link.tenant,
            business=business,
            kind=link.kind,
            document_id=link.document_id,
            public_url=public_url,
        )
        fmt = str(request.query_params.get("format") or "html").lower()
        layout = str(request.query_params.get("layout") or LAYOUT_A4).lower()
        if fmt == "json":
            return success_response(payload)
        if fmt == "pdf":
            pdf = self.docs.build_pdf(payload, layout=layout)
            filename = f"{payload.get('number') or token}.pdf".replace(" ", "_")
            response = HttpResponse(pdf, content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{filename}"'
            return response
        html = self.docs.render_html(payload, layout=layout)
        return HttpResponse(html, content_type="text/html; charset=utf-8")


class PublicShopDocumentPdfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    docs = ShopDocumentService()

    def get(self, request: Request, token: str) -> HttpResponse:
        try:
            link = self.docs.get_share_by_token(token)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        self.docs.touch_share_view(link)
        public_url = self.docs.public_url_for(link)
        payload = self.docs.build_payload(
            tenant=link.tenant,
            business=link.business,
            kind=link.kind,
            document_id=link.document_id,
            public_url=public_url,
        )
        layout = str(request.query_params.get("layout") or LAYOUT_A4).lower()
        pdf = self.docs.build_pdf(payload, layout=layout)
        filename = f"{payload.get('number') or token}.pdf".replace(" ", "_")
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


def books_voucher_for_order(*, tenant, order) -> ShopBooksVoucher | None:
    return (
        ShopBooksVoucher.objects.filter(
            tenant=tenant,
            business_id=order.business_id,
            linked_order=order,
            voucher_type="sale",
        )
        .order_by("-created_at")
        .first()
    )


def books_voucher_for_booking(*, tenant, business, booking) -> ShopBooksVoucher | None:
    from apps.shopie.services.books import BooksService

    return BooksService.books_voucher_for_booking(
        tenant=tenant, business=business, booking_id=booking.id
    )
