from __future__ import annotations

import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.urls import reverse
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.services.cashfree_client import CashfreeClient
from apps.billing.services.razorpay_client import RazorpayClient
from apps.businesses.constants import (
    FEATURE_SHOPIE_BOOKS_QUOTATIONS,
    FEATURE_SHOPIE_ORDERS,
    FEATURE_SHOPIE_PRODUCTS,
)
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.customers.models import Customer
from apps.shopie.api.access import (
    CATALOG_FEATURES,
    INVOICE_FEATURES,
    POS_SCAN_FEATURES,
    STOCK_FEATURES,
    require_any_shopie_feature,
)
from apps.shopie.api.access import (
    require_business as _business,
)
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    BarcodeLookupSerializer,
    EnrichBarcodeSerializer,
    CashfreePaymentVerifySerializer,
    MerchantPaymentSettingsSerializer,
    PackagingAnalyzeSerializer,
    RazorpayPaymentVerifySerializer,
    ShopInvoiceSerializer,
    ShopOrderCreateSerializer,
    ShopOrderSerializer,
    ShopOrderSettlePaymentSerializer,
    ShopOrderStatusSerializer,
    ShopProductBulkCreateSerializer,
    ShopProductBulkPatchSerializer,
    ShopProductPatchSerializer,
    ShopProductSerializer,
    ShopProductWriteSerializer,
    ShopQuotationCreateSerializer,
    ShopQuotationSerializer,
    ShopStockMovementSerializer,
    StockAdjustSerializer,
)
from apps.shopie.models import ShopInvoice, ShopOrder, ShopProduct, ShopQuotation, ShopStockMovement
from apps.shopie.services import CatalogService, OrderService
from apps.shopie.services.fulfillment import FulfillmentService
from apps.shopie.services.merchant_payments import MerchantPaymentService
from apps.shopie.services.packaging_analysis import PackagingAnalysisService
from apps.shopie.tasks import analyze_packaging_images_task


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError({"detail": list(exc.messages) if hasattr(exc, "messages") else str(exc)})


class ShopProductListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    @extend_schema(responses=ShopProductSerializer(many=True))
    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, features=CATALOG_FEATURES)
        qs = self.catalog.list_products(
            tenant=request.current_tenant,
            business=business,
            search=request.query_params.get("search"),
            status=request.query_params.get("status"),
            category=request.query_params.get("category"),
        )
        return paginated_list_response(request, qs, ShopProductSerializer)

    @extend_schema(request=ShopProductWriteSerializer, responses=ShopProductSerializer)
    def post(self, request: Request) -> Response:
        serializer = ShopProductWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data.pop("business_id"), features=CATALOG_FEATURES)
        barcodes = data.pop("barcodes", None)
        try:
            product = self.catalog.create_product(
                tenant=request.current_tenant,
                business=business,
                data=data,
                barcodes=barcodes,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopProductSerializer(product).data, status_code=status.HTTP_201_CREATED)


class ShopProductDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    def _get(self, request: Request, product_id) -> ShopProduct:
        product = (
            ShopProduct.objects.filter(tenant=request.current_tenant, id=product_id)
            .prefetch_related("barcodes")
            .first()
        )
        if not product:
            raise NotFound("Product not found.")
        require_any_shopie_feature(product.business, CATALOG_FEATURES)
        return product

    @extend_schema(responses=ShopProductSerializer)
    def get(self, request: Request, product_id) -> Response:
        return success_response(ShopProductSerializer(self._get(request, product_id)).data)

    @extend_schema(request=ShopProductPatchSerializer, responses=ShopProductSerializer)
    def patch(self, request: Request, product_id) -> Response:
        product = self._get(request, product_id)
        serializer = ShopProductPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("business_id", None)
        barcodes = data.pop("barcodes", None)
        try:
            product = self.catalog.update_product(
                tenant=request.current_tenant,
                business=product.business,
                product=product,
                data=data,
                barcodes=barcodes,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopProductSerializer(product).data)


class ShopProductBulkView(APIView):
    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    @extend_schema(request=ShopProductBulkCreateSerializer)
    def post(self, request: Request) -> Response:
        serializer = ShopProductBulkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"], features=CATALOG_FEATURES)
        created, errors = self.catalog.create_products_bulk(
            tenant=request.current_tenant,
            business=business,
            items=list(data["items"]),
            godown_id=data.get("godown_id"),
        )
        return success_response(
            {
                "created": ShopProductSerializer(created, many=True).data,
                "errors": errors,
            }
        )

    @extend_schema(request=ShopProductBulkPatchSerializer)
    def patch(self, request: Request) -> Response:
        serializer = ShopProductBulkPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"], features=CATALOG_FEATURES)
        updated, errors = self.catalog.update_products_bulk(
            tenant=request.current_tenant,
            business=business,
            ids=list(data["ids"]),
            updates=dict(data["updates"]),
        )
        return success_response(
            {
                "updated": ShopProductSerializer(updated, many=True).data,
                "errors": errors,
            }
        )


class ShopBarcodeLookupView(APIView):
    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    @extend_schema(request=BarcodeLookupSerializer, responses=ShopProductSerializer)
    def post(self, request: Request) -> Response:
        serializer = BarcodeLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = _business(request, serializer.validated_data["business_id"], features=POS_SCAN_FEATURES)
        product = self.catalog.lookup_by_barcode(
            tenant=request.current_tenant,
            business=business,
            code=serializer.validated_data["code"],
        )
        if not product:
            raise NotFound("No product found for this barcode.")
        product = self.catalog.get_product(
            tenant=request.current_tenant, business=business, product_id=product.id
        )
        return success_response(ShopProductSerializer(product).data)


class ShopBarcodeEnrichView(APIView):
    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    @extend_schema(request=EnrichBarcodeSerializer)
    def post(self, request: Request) -> Response:
        serializer = EnrichBarcodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        code = (data.get("code") or "").strip()
        query = (data.get("query") or "").strip()
        image_url = (data.get("image_url") or "").strip()
        hint = (data.get("hint") or "").strip()
        if image_url or (hint and not code):
            result = self.catalog.enrich_from_image(image_url=image_url, hint=hint or query)
        else:
            result = self.catalog.enrich_barcode(code=code, query=query)
        return success_response(result)


class ShopPackagingAnalyzeView(APIView):
    """Queue (or run) front/back packaging photo analysis for product add."""

    permission_classes = [ShopAccessPermission]
    analysis = PackagingAnalysisService()

    @extend_schema(request=PackagingAnalyzeSerializer)
    def post(self, request: Request) -> Response:
        serializer = PackagingAnalyzeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        _business(request, data["business_id"], feature=FEATURE_SHOPIE_PRODUCTS)
        front = (data.get("front_image_url") or "").strip()
        back = (data.get("back_image_url") or "").strip()
        hint = (data.get("hint") or "").strip()
        async_mode = bool(data.get("async_mode", True))

        job_id = self.analysis.start_job(
            front_image_url=front,
            back_image_url=back,
            hint=hint,
        )
        if async_mode:
            analyze_packaging_images_task.delay(
                job_id,
                front_image_url=front,
                back_image_url=back,
                hint=hint,
            )
            job = self.analysis.get_job(job_id) or {"status": "queued"}
            return success_response(
                {
                    "job_id": job_id,
                    "status": job.get("status", "queued"),
                    "result": job.get("result"),
                    "error": job.get("error"),
                },
                status_code=status.HTTP_202_ACCEPTED,
            )

        job = self.analysis.run_job(
            job_id=job_id,
            front_image_url=front,
            back_image_url=back,
            hint=hint,
        )
        return success_response(
            {
                "job_id": job_id,
                "status": job.get("status"),
                "result": job.get("result"),
                "error": job.get("error"),
            }
        )


class ShopPackagingAnalyzeStatusView(APIView):
    permission_classes = [ShopAccessPermission]
    analysis = PackagingAnalysisService()

    def get(self, request: Request, job_id) -> Response:
        job = self.analysis.get_job(str(job_id))
        if not job:
            raise NotFound("Analysis job not found or expired.")
        return success_response(
            {
                "job_id": str(job_id),
                "status": job.get("status"),
                "result": job.get("result"),
                "error": job.get("error"),
                "front_image_url": job.get("front_image_url"),
                "back_image_url": job.get("back_image_url"),
            }
        )


class ShopStockAdjustView(APIView):
    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    @extend_schema(request=StockAdjustSerializer, responses=ShopProductSerializer)
    def post(self, request: Request, product_id) -> Response:
        product = get_object_or_404(ShopProduct, tenant=request.current_tenant, id=product_id)
        require_any_shopie_feature(product.business, STOCK_FEATURES)
        serializer = StockAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            product = self.catalog.adjust_stock(
                tenant=request.current_tenant,
                business=product.business,
                product=product,
                quantity_delta=serializer.validated_data["quantity_delta"],
                movement_type=serializer.validated_data.get("movement_type") or "adjust",
                reason=serializer.validated_data.get("reason") or "",
                godown_id=serializer.validated_data.get("godown_id"),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        product = self.catalog.get_product(
            tenant=request.current_tenant, business=product.business, product_id=product.id
        )
        return success_response(ShopProductSerializer(product).data)


class ShopProductOfficeStockView(APIView):
    """Quantity of one product at each office, for merchant stock views."""

    permission_classes = [ShopAccessPermission]

    def get(self, request: Request, product_id) -> Response:
        product = get_object_or_404(ShopProduct, tenant=request.current_tenant, id=product_id)
        require_any_shopie_feature(product.business, STOCK_FEATURES)
        offices = FulfillmentService().office_availability(
            tenant=request.current_tenant,
            business=product.business,
            product_ids=[product.id],
        )
        return success_response(
            [
                {
                    "branch_id": office["branch_id"],
                    "branch_name": office["branch_name"],
                    "is_primary": office["is_primary"],
                    "godown_id": office["godown_id"],
                    "quantity": office["quantities"].get(str(product.id), "0.000"),
                }
                for office in offices
            ]
        )


class ShopStockMovementListView(APIView):
    permission_classes = [ShopAccessPermission]

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        product_id = request.query_params.get("product_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, features=STOCK_FEATURES)
        qs = ShopStockMovement.objects.filter(tenant=request.current_tenant, business=business)
        if product_id:
            qs = qs.filter(product_id=product_id)
        return paginated_list_response(request, qs, ShopStockMovementSerializer)


class ShopOrderListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_ORDERS)
        customer_id = request.query_params.get("customer_id")
        qs = self.orders.list_orders(
            tenant=request.current_tenant,
            business=business,
            status=request.query_params.get("status"),
            customer_id=customer_id,
        )
        return paginated_list_response(request, qs, ShopOrderSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"], feature=FEATURE_SHOPIE_ORDERS)
        customer = None
        if data.get("customer_id"):
            customer = get_object_or_404(
                Customer, tenant=request.current_tenant, business=business, id=data["customer_id"]
            )
        try:
            customer_gstin = str(data.get("customer_gstin") or "").strip().upper()
            metadata_extra: dict = {}
            if customer_gstin:
                metadata_extra["customer_gstin"] = customer_gstin
            elif customer is not None and getattr(customer, "gstin", None):
                metadata_extra["customer_gstin"] = str(customer.gstin).strip().upper()
            if customer is not None:
                metadata_extra["customer_name"] = (
                    customer.display_name
                    or f"{customer.first_name or ''} {customer.last_name or ''}".strip()
                    or str(customer.id)
                )
            order = self.orders.create_order(
                tenant=request.current_tenant,
                business=business,
                customer=customer,
                lines=data["lines"],
                fulfillment_mode=data.get("fulfillment_mode") or "pickup",
                notes=data.get("notes") or "",
                delivery_address=data.get("delivery_address") or "",
                delivery_city=data.get("delivery_city") or "",
                delivery_state=data.get("delivery_state") or "",
                delivery_postal_code=data.get("delivery_postal_code") or "",
                delivery_latitude=data.get("delivery_latitude"),
                delivery_longitude=data.get("delivery_longitude"),
                delivery_method=data.get("delivery_method") or "",
                delivery_quote_id=data.get("delivery_quote_id") or "",
                displayed_delivery_fee=data.get("displayed_delivery_fee"),
                confirm=bool(data.get("confirm")),
                bill_discount_type=data.get("bill_discount_type") or "",
                bill_discount_value=data.get("bill_discount_value") or 0,
                payment_method=data.get("payment_method") or "",
                coupon_code=data.get("coupon_code") or "",
                points_to_redeem=int(data.get("points_to_redeem") or 0),
                metadata_extra=metadata_extra or None,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        except ShopProduct.DoesNotExist as exc:
            raise ValidationError({"lines": "One or more products were not found."}) from exc
        return success_response(ShopOrderSerializer(order).data, status_code=status.HTTP_201_CREATED)


class ShopOrderDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def get(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        order = self.orders.get_order(
            tenant=request.current_tenant, business=order.business, order_id=order.id
        )
        return success_response(ShopOrderSerializer(order).data)


class ShopOrderStatusView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        serializer = ShopOrderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = self.orders.transition(
                tenant=request.current_tenant,
                business=order.business,
                order=order,
                status=serializer.validated_data["status"],
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopOrderSerializer(order).data)


class ShopOrderSettlePaymentView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        serializer = ShopOrderSettlePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = self.orders.settle_payment(
                tenant=request.current_tenant,
                business=order.business,
                order=order,
                settled_via=serializer.validated_data.get("settled_via") or "cash",
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopOrderSerializer(order).data)


class ShopOrderConfirmPaymentView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        action = str(request.data.get("action") or "").strip().lower()
        note = str(request.data.get("note") or "")
        try:
            order = self.orders.confirm_or_reject_payment(
                tenant=request.current_tenant,
                business=order.business,
                order=order,
                action=action,
                note=note,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopOrderSerializer(order).data)


class MerchantPaymentSettingsView(APIView):
    permission_classes = [ShopAccessPermission]
    payments = MerchantPaymentService()

    def _business(self, request: Request, business_id):
        return _business(request, business_id, feature=FEATURE_SHOPIE_ORDERS)

    def _webhook_url(self, request: Request, business) -> str:
        return request.build_absolute_uri(
            reverse("shop-razorpay-webhook", kwargs={"business_id": business.id})
        )

    def _cashfree_webhook_url(self, request: Request, business) -> str:
        return request.build_absolute_uri(
            reverse("shop-cashfree-webhook", kwargs={"business_id": business.id})
        )

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = self._business(request, business_id)
        return success_response(
            self.payments.public_settings(
                business=business,
                webhook_url=self._webhook_url(request, business),
                cashfree_webhook_url=self._cashfree_webhook_url(request, business),
            )
        )

    def patch(self, request: Request) -> Response:
        serializer = MerchantPaymentSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = self._business(request, data["business_id"])
        try:
            cashfree = data.get("cashfree") if isinstance(data.get("cashfree"), dict) else None
            razorpay_touched = any(
                field in request.data
                for field in ("key_id", "key_secret", "webhook_secret", "enabled")
            )
            if razorpay_touched or cashfree is None:
                payload = self.payments.update_settings(
                    business=business,
                    key_id=data.get("key_id") or "",
                    key_secret=data.get("key_secret") or "",
                    webhook_secret=data.get("webhook_secret") or "",
                    upi_vpa=data.get("upi_vpa"),
                    enabled=data.get("enabled"),
                    test_connection=bool(data.get("test_connection", True)),
                )
            else:
                payload = self.payments.public_settings(business=business)
            if cashfree is not None:
                payload = self.payments.update_cashfree_settings(
                    business=business,
                    app_id=str(cashfree.get("app_id") or ""),
                    secret_key=str(cashfree.get("secret_key") or ""),
                    enabled=cashfree.get("enabled"),
                    env=cashfree.get("env"),
                    test_connection=bool(cashfree.get("test_connection", data.get("test_connection", True))),
                    upi_vpa=data.get("upi_vpa"),
                )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        payload["webhook_url"] = self._webhook_url(request, business)
        payload["cashfree"] = payload.get("cashfree") or {}
        payload["cashfree"]["webhook_url"] = self._cashfree_webhook_url(request, business)
        return success_response(payload)


class ShopOrderRazorpayCheckoutView(APIView):
    permission_classes = [ShopAccessPermission]
    payments = MerchantPaymentService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        try:
            payload = self.payments.create_checkout(order=order)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(payload, status_code=status.HTTP_201_CREATED)


class ShopOrderRazorpayVerifyView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()
    payments = MerchantPaymentService()

    def post(self, request: Request, order_id) -> Response:
        serializer = RazorpayPaymentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        pos = (order.metadata or {}).get("pos") or {}
        if str(pos.get("razorpay_order_id") or "") != data["razorpay_order_id"]:
            raise ValidationError({"razorpay_order_id": "Order ID does not match this bill."})
        config = self.payments.config_for_business(business=order.business)
        valid = RazorpayClient(config.as_client_config()).verify_payment_signature(
            order_id=data["razorpay_order_id"],
            payment_id=data["razorpay_payment_id"],
            signature=data["razorpay_signature"],
        )
        if not valid:
            raise ValidationError({"razorpay_signature": "Payment signature is invalid."})
        order = self.orders.mark_razorpay_paid(
            tenant=order.tenant,
            business=order.business,
            order=order,
            payment_id=data["razorpay_payment_id"],
        )
        return success_response(ShopOrderSerializer(order).data)


class ShopRazorpayWebhookView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    orders = OrderService()
    payments = MerchantPaymentService()

    def post(self, request: Request, business_id) -> Response:
        business = get_object_or_404(Business.all_objects.select_related("tenant"), id=business_id)
        config = self.payments.config_for_business(business=business)
        signature = request.headers.get("X-Razorpay-Signature", "")
        if not RazorpayClient(config.as_client_config()).verify_webhook_signature(
            request.body,
            signature,
        ):
            return Response({"detail": "Invalid signature."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValidationError({"payload": "Invalid JSON payload."})
        if str(payload.get("event") or "") != "payment.captured":
            return success_response({"processed": False, "reason": "event_ignored"})
        payment = payload.get("payload", {}).get("payment", {}).get("entity", {}) or {}
        razorpay_order_id = str(payment.get("order_id") or "")
        payment_id = str(payment.get("id") or "")
        order = ShopOrder.all_objects.filter(
            business=business,
            metadata__pos__razorpay_order_id=razorpay_order_id,
        ).first()
        if order is None:
            return success_response({"processed": False, "reason": "order_not_found"})
        self.orders.mark_razorpay_paid(
            tenant=business.tenant,
            business=business,
            order=order,
            payment_id=payment_id,
        )
        return success_response({"processed": True})


class ShopOrderCashfreeCheckoutView(APIView):
    permission_classes = [ShopAccessPermission]
    payments = MerchantPaymentService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        try:
            payload = self.payments.create_cashfree_checkout(order=order)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(payload, status_code=status.HTTP_201_CREATED)


class ShopOrderCashfreeVerifyView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()
    payments = MerchantPaymentService()

    def post(self, request: Request, order_id) -> Response:
        serializer = CashfreePaymentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, (FEATURE_SHOPIE_ORDERS,))
        pos = (order.metadata or {}).get("pos") or {}
        if str(pos.get("cashfree_order_id") or "") != data["cashfree_order_id"]:
            raise ValidationError({"cashfree_order_id": "Order ID does not match this bill."})
        config = self.payments.cashfree_config_for_business(business=order.business)
        client = CashfreeClient(config.as_client_config())
        remote = client.get_order(data["cashfree_order_id"])
        status_value = str(remote.get("order_status") or "").upper()
        paid = status_value == "PAID" or bool(remote.get("mock"))
        if not paid:
            paid = any(
                str(item.get("payment_status") or "").upper() == "SUCCESS"
                for item in client.get_payments(data["cashfree_order_id"])
            )
        if not paid:
            raise ValidationError({"cashfree": "Cashfree has not confirmed this payment yet."})
        order = self.orders.mark_online_paid(
            tenant=order.tenant,
            business=order.business,
            order=order,
            payment_id=str(data.get("cashfree_payment_id") or data["cashfree_order_id"]),
            payment_method="cashfree",
        )
        return success_response(ShopOrderSerializer(order).data)


class ShopCashfreeWebhookView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    orders = OrderService()
    payments = MerchantPaymentService()

    def post(self, request: Request, business_id) -> Response:
        business = get_object_or_404(Business.all_objects.select_related("tenant"), id=business_id)
        config = self.payments.cashfree_config_for_business(business=business)
        signature = request.headers.get("x-webhook-signature", "") or request.headers.get(
            "X-Webhook-Signature", ""
        )
        timestamp = request.headers.get("x-webhook-timestamp", "") or request.headers.get(
            "X-Webhook-Timestamp", ""
        )
        if not CashfreeClient(config.as_client_config()).verify_webhook_signature(
            body=request.body,
            timestamp=timestamp,
            signature=signature,
        ):
            return Response({"detail": "Invalid signature."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValidationError({"payload": "Invalid JSON payload."})
        event_type = str(payload.get("type") or "")
        if event_type not in {"PAYMENT_SUCCESS_WEBHOOK"}:
            return success_response({"processed": False, "reason": "event_ignored"})
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        order_info = data.get("order") if isinstance(data.get("order"), dict) else {}
        payment = data.get("payment") if isinstance(data.get("payment"), dict) else {}
        cashfree_order_id = str(order_info.get("order_id") or "")
        payment_id = str(payment.get("cf_payment_id") or "")
        order = ShopOrder.all_objects.filter(
            business=business,
            metadata__pos__cashfree_order_id=cashfree_order_id,
        ).first()
        if order is None:
            return success_response({"processed": False, "reason": "order_not_found"})
        self.orders.mark_online_paid(
            tenant=business.tenant,
            business=business,
            order=order,
            payment_id=payment_id or cashfree_order_id,
            payment_method="cashfree",
        )
        return success_response({"processed": True})


class ShopInvoiceFromOrderView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
        require_any_shopie_feature(order.business, INVOICE_FEATURES)
        invoice = self.orders.create_invoice_from_order(
            tenant=request.current_tenant, business=order.business, order=order
        )
        return success_response(ShopInvoiceSerializer(invoice).data, status_code=status.HTTP_201_CREATED)


class ShopInvoiceListView(APIView):
    permission_classes = [ShopAccessPermission]

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, features=INVOICE_FEATURES)
        qs = ShopInvoice.objects.filter(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopInvoiceSerializer)


class ShopQuotationListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_BOOKS_QUOTATIONS)
        qs = ShopQuotation.objects.filter(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopQuotationSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopQuotationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"], feature=FEATURE_SHOPIE_BOOKS_QUOTATIONS)
        customer = None
        if data.get("customer_id"):
            customer = get_object_or_404(
                Customer, tenant=request.current_tenant, business=business, id=data["customer_id"]
            )
        try:
            quote = self.orders.create_quotation(
                tenant=request.current_tenant,
                business=business,
                customer=customer,
                lines=data["lines"],
                notes=data.get("notes") or "",
                valid_until=data.get("valid_until"),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopQuotationSerializer(quote).data, status_code=status.HTTP_201_CREATED)
