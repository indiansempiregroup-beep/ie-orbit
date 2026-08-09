from __future__ import annotations

import datetime as dt

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
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
    ShopBooksVoucherSerializer,
    ShopCashAccountSerializer,
    ShopCashAccountWriteSerializer,
    ShopCreditNoteCreateSerializer,
    ShopDebitNoteCreateSerializer,
    ShopExpenseCreateSerializer,
    ShopOtherIncomeCreateSerializer,
    ShopPartyLedgerEntrySerializer,
    ShopPartyStatementQuerySerializer,
    ShopPaymentInCreateSerializer,
    ShopPaymentOutCreateSerializer,
    ShopPurchaseVoucherCreateSerializer,
    ShopQuotationConvertSerializer,
    ShopSaleVoucherCreateSerializer,
    ShopSupplierPatchSerializer,
    ShopSupplierSerializer,
    ShopSupplierWriteSerializer,
    ShopTransferCreateSerializer,
)
from apps.shopie.models import (
    ShopBooksVoucher,
    ShopCashAccount,
    ShopQuotation,
    ShopSupplier,
    VoucherType,
)
from apps.shopie.services.books import BooksService
from apps.shopie.services.suppliers import SupplierService


def _business(request: Request, business_id) -> Business:
    return get_object_or_404(Business, tenant=request.current_tenant, id=business_id)


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError({"detail": list(exc.messages) if hasattr(exc, "messages") else str(exc)})


def _parse_date(raw: str | None) -> dt.date | None:
    if not raw:
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError as exc:
        raise ValidationError({"date": "Dates must be in YYYY-MM-DD format."}) from exc


class ShopBooksDashboardView(APIView):
    permission_classes = [ShopAccessPermission]
    books = BooksService()

    def _business_id(self, request: Request) -> str:
        business_id = request.query_params.get("business_id") or request.data.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        return business_id

    def get(self, request: Request) -> Response:
        business = _business(request, self._business_id(request))
        metrics = self.books.get_dashboard_metrics(tenant=request.current_tenant, business=business)
        return success_response(metrics)

    def post(self, request: Request) -> Response:
        return self.get(request)


class ShopSupplierListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    suppliers = SupplierService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = self.suppliers.list_suppliers(
            tenant=request.current_tenant,
            business=business,
            search=request.query_params.get("search"),
        )
        return paginated_list_response(request, qs, ShopSupplierSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopSupplierWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data.pop("business_id"))
        try:
            supplier = self.suppliers.create_supplier(
                tenant=request.current_tenant, business=business, data=data
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopSupplierSerializer(supplier).data, status_code=status.HTTP_201_CREATED
        )


class ShopSupplierDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    suppliers = SupplierService()

    def _get(self, request: Request, supplier_id) -> ShopSupplier:
        supplier = ShopSupplier.objects.filter(
            tenant=request.current_tenant, id=supplier_id
        ).first()
        if not supplier:
            raise NotFound("Supplier not found.")
        return supplier

    def get(self, request: Request, supplier_id) -> Response:
        return success_response(ShopSupplierSerializer(self._get(request, supplier_id)).data)

    def patch(self, request: Request, supplier_id) -> Response:
        supplier = self._get(request, supplier_id)
        serializer = ShopSupplierPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("business_id", None)
        try:
            supplier = self.suppliers.update_supplier(supplier=supplier, data=data)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopSupplierSerializer(supplier).data)

    def delete(self, request: Request, supplier_id) -> Response:
        supplier = self._get(request, supplier_id)
        self.suppliers.delete_supplier(supplier=supplier)
        return success_response({"deleted": True})


class ShopCashAccountListCreateView(APIView):
    permission_classes = [ShopAccessPermission]

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = ShopCashAccount.objects.filter(
            tenant=request.current_tenant, business=business
        ).order_by("name")
        return paginated_list_response(request, qs, ShopCashAccountSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopCashAccountWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data.pop("business_id"))
        opening = data.get("opening_balance") or 0
        account = ShopCashAccount.objects.create(
            tenant=request.current_tenant,
            business=business,
            name=data["name"],
            account_type=data.get("account_type") or "cash",
            opening_balance=opening,
            current_balance=opening,
            is_active=data.get("is_active", True),
            metadata=data.get("metadata") or {},
        )
        return success_response(
            ShopCashAccountSerializer(account).data, status_code=status.HTTP_201_CREATED
        )


class ShopCashAccountDetailView(APIView):
    permission_classes = [ShopAccessPermission]

    def _get(self, request: Request, account_id) -> ShopCashAccount:
        account = ShopCashAccount.objects.filter(
            tenant=request.current_tenant, id=account_id
        ).first()
        if not account:
            raise NotFound("Account not found.")
        return account

    def get(self, request: Request, account_id) -> Response:
        return success_response(ShopCashAccountSerializer(self._get(request, account_id)).data)

    def patch(self, request: Request, account_id) -> Response:
        account = self._get(request, account_id)
        serializer = ShopCashAccountWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("business_id", None)
        for field in ("name", "account_type", "is_active"):
            if field in data and data[field] is not None:
                setattr(account, field, data[field])
        if "metadata" in data and data["metadata"] is not None:
            account.metadata = {**(account.metadata or {}), **data["metadata"]}
        account.save()
        return success_response(ShopCashAccountSerializer(account).data)


_VOUCHER_CREATE_MAP = {
    VoucherType.SALE: ShopSaleVoucherCreateSerializer,
    VoucherType.PURCHASE: ShopPurchaseVoucherCreateSerializer,
    VoucherType.CREDIT_NOTE: ShopCreditNoteCreateSerializer,
    VoucherType.DEBIT_NOTE: ShopDebitNoteCreateSerializer,
    VoucherType.PAYMENT_IN: ShopPaymentInCreateSerializer,
    VoucherType.PAYMENT_OUT: ShopPaymentOutCreateSerializer,
    VoucherType.EXPENSE: ShopExpenseCreateSerializer,
    VoucherType.OTHER_INCOME: ShopOtherIncomeCreateSerializer,
    VoucherType.TRANSFER: ShopTransferCreateSerializer,
}


class ShopBooksVoucherListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    books = BooksService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = self.books.list_vouchers(
            tenant=request.current_tenant,
            business=business,
            voucher_type=request.query_params.get("type"),
            status=request.query_params.get("status"),
            date_from=_parse_date(request.query_params.get("date_from")),
            date_to=_parse_date(request.query_params.get("date_to")),
            customer_id=request.query_params.get("customer_id") or None,
            supplier_id=request.query_params.get("supplier_id") or None,
        )
        return paginated_list_response(request, qs, ShopBooksVoucherSerializer)

    def post(self, request: Request) -> Response:
        voucher_type = str(request.data.get("voucher_type") or "").strip().lower()
        serializer_cls = _VOUCHER_CREATE_MAP.get(voucher_type)
        if serializer_cls is None:
            raise ValidationError(
                {
                    "voucher_type": (
                        f"Unsupported voucher_type '{voucher_type}'. "
                        f"Expected one of: {', '.join(_VOUCHER_CREATE_MAP.keys())}."
                    )
                }
            )
        serializer = serializer_cls(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        business = _business(request, data.pop("business_id"))

        if data.get("customer_id"):
            customer_id = data.pop("customer_id")
            data["customer"] = get_object_or_404(
                Customer, tenant=request.current_tenant, business=business, id=customer_id
            )
        else:
            data.pop("customer_id", None)
        if data.get("supplier_id"):
            supplier_id = data.pop("supplier_id")
            data["supplier"] = get_object_or_404(
                ShopSupplier, tenant=request.current_tenant, business=business, id=supplier_id
            )
        else:
            data.pop("supplier_id", None)

        creator = {
            VoucherType.SALE: self.books.create_sale_voucher,
            VoucherType.PURCHASE: self.books.create_purchase_voucher,
            VoucherType.CREDIT_NOTE: self.books.create_credit_note,
            VoucherType.DEBIT_NOTE: self.books.create_debit_note,
            VoucherType.PAYMENT_IN: self.books.create_payment_in,
            VoucherType.PAYMENT_OUT: self.books.create_payment_out,
            VoucherType.EXPENSE: self.books.create_expense,
            VoucherType.OTHER_INCOME: self.books.create_other_income,
            VoucherType.TRANSFER: self.books.create_transfer,
        }[voucher_type]
        try:
            voucher = creator(tenant=request.current_tenant, business=business, data=data)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopBooksVoucherSerializer(voucher).data, status_code=status.HTTP_201_CREATED
        )


class ShopBooksVoucherDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    books = BooksService()

    def get(self, request: Request, voucher_id) -> Response:
        voucher = get_object_or_404(ShopBooksVoucher, tenant=request.current_tenant, id=voucher_id)
        voucher = self.books.get_voucher(
            tenant=request.current_tenant, business=voucher.business, voucher_id=voucher.id
        )
        return success_response(ShopBooksVoucherSerializer(voucher).data)


class ShopBooksVoucherVoidView(APIView):
    permission_classes = [ShopAccessPermission]
    books = BooksService()

    def post(self, request: Request, voucher_id) -> Response:
        voucher = get_object_or_404(ShopBooksVoucher, tenant=request.current_tenant, id=voucher_id)
        try:
            voucher = self.books.void_voucher(
                tenant=request.current_tenant, business=voucher.business, voucher=voucher
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopBooksVoucherSerializer(voucher).data)


class ShopPartyStatementView(APIView):
    permission_classes = [ShopAccessPermission]
    books = BooksService()

    def get(self, request: Request) -> Response:
        serializer = ShopPartyStatementQuerySerializer(
            data={
                "business_id": request.query_params.get("business_id"),
                "kind": request.query_params.get("kind"),
                "id": request.query_params.get("id"),
            }
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        try:
            statement = self.books.party_statement(
                tenant=request.current_tenant,
                business=business,
                party_kind=data["kind"],
                party_id=data["id"],
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        statement["entries"] = ShopPartyLedgerEntrySerializer(statement["entries"], many=True).data
        return success_response(statement)


_REPORT_SLUGS = {"sales", "purchase", "daybook", "gstr1", "gstr3b", "pnl"}


class ShopBooksReportView(APIView):
    permission_classes = [ShopAccessPermission]
    books = BooksService()

    def get(self, request: Request, slug: str) -> Response:
        slug = (slug or "").strip().lower()
        if slug not in _REPORT_SLUGS:
            raise NotFound(f"Unknown report '{slug}'.")
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))

        report_fn = {
            "sales": self.books.sales_summary,
            "purchase": self.books.purchase_summary,
            "daybook": self.books.daybook,
            "gstr1": self.books.gstr1_rows,
            "gstr3b": self.books.gstr3b_summary,
            "pnl": self.books.pnl_simple,
        }[slug]
        data = report_fn(
            tenant=request.current_tenant, business=business, date_from=date_from, date_to=date_to
        )
        return success_response(data)


class ShopQuotationConvertToSaleView(APIView):
    permission_classes = [ShopAccessPermission]
    books = BooksService()

    def post(self, request: Request, quotation_id) -> Response:
        quotation = get_object_or_404(ShopQuotation, tenant=request.current_tenant, id=quotation_id)
        serializer = ShopQuotationConvertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            voucher = self.books.convert_quotation_to_sale(
                tenant=request.current_tenant,
                business=quotation.business,
                quotation=quotation,
                data=data,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopBooksVoucherSerializer(voucher).data, status_code=status.HTTP_201_CREATED
        )
