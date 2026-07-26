from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.customers.models import Customer
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    BarcodeLookupSerializer,
    EnrichBarcodeSerializer,
    PackagingAnalyzeSerializer,
    ShopInvoiceSerializer,
    ShopOrderCreateSerializer,
    ShopOrderSerializer,
    ShopOrderSettlePaymentSerializer,
    ShopOrderStatusSerializer,
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
from apps.shopie.services.packaging_analysis import PackagingAnalysisService
from apps.shopie.tasks import analyze_packaging_images_task


def _business(request: Request, business_id) -> Business:
    return get_object_or_404(Business, tenant=request.current_tenant, id=business_id)


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
        business = _business(request, business_id)
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
        business = _business(request, data.pop("business_id"))
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


class ShopBarcodeLookupView(APIView):
    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    @extend_schema(request=BarcodeLookupSerializer, responses=ShopProductSerializer)
    def post(self, request: Request) -> Response:
        serializer = BarcodeLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = _business(request, serializer.validated_data["business_id"])
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
        _business(request, data["business_id"])
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
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        product = self.catalog.get_product(
            tenant=request.current_tenant, business=product.business, product_id=product.id
        )
        return success_response(ShopProductSerializer(product).data)


class ShopStockMovementListView(APIView):
    permission_classes = [ShopAccessPermission]

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        product_id = request.query_params.get("product_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
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
        business = _business(request, business_id)
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
        business = _business(request, data["business_id"])
        customer = None
        if data.get("customer_id"):
            customer = get_object_or_404(
                Customer, tenant=request.current_tenant, business=business, id=data["customer_id"]
            )
        try:
            order = self.orders.create_order(
                tenant=request.current_tenant,
                business=business,
                customer=customer,
                lines=data["lines"],
                fulfillment_mode=data.get("fulfillment_mode") or "pickup",
                notes=data.get("notes") or "",
                delivery_address=data.get("delivery_address") or "",
                delivery_city=data.get("delivery_city") or "",
                delivery_postal_code=data.get("delivery_postal_code") or "",
                confirm=bool(data.get("confirm")),
                bill_discount_type=data.get("bill_discount_type") or "",
                bill_discount_value=data.get("bill_discount_value") or 0,
                payment_method=data.get("payment_method") or "",
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
        order = self.orders.get_order(
            tenant=request.current_tenant, business=order.business, order_id=order.id
        )
        return success_response(ShopOrderSerializer(order).data)


class ShopOrderStatusView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
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


class ShopInvoiceFromOrderView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def post(self, request: Request, order_id) -> Response:
        order = get_object_or_404(ShopOrder, tenant=request.current_tenant, id=order_id)
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
        business = _business(request, business_id)
        qs = ShopInvoice.objects.filter(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopInvoiceSerializer)


class ShopQuotationListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    orders = OrderService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = ShopQuotation.objects.filter(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopQuotationSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopQuotationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
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
