from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.customers.models import Customer
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    ShopBooksDocumentConvertSerializer,
    ShopBooksDocumentCreateSerializer,
    ShopBooksDocumentSerializer,
    ShopBooksVoucherSerializer,
    ShopChequeClearSerializer,
    ShopChequeCreateSerializer,
    ShopChequeSerializer,
    ShopGodownCreateSerializer,
    ShopGodownSerializer,
    ShopLoanCreateSerializer,
    ShopLoanRepaymentSerializer,
    ShopLoanSerializer,
    ShopStockTransferCreateSerializer,
    ShopStockTransferSerializer,
)
from apps.shopie.models import (
    ShopBooksDocument,
    ShopBooksVoucher,
    ShopCashAccount,
    ShopCheque,
    ShopLoan,
    ShopSupplier,
)
from apps.shopie.services.cheques import ChequesService
from apps.shopie.services.documents import DocumentsService
from apps.shopie.services.godowns import GodownsService
from apps.shopie.services.loans import LoansService


def _business(request: Request, business_id) -> Business:
    return get_object_or_404(Business, tenant=request.current_tenant, id=business_id)


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError(list(exc.messages))
    return ValidationError(str(exc))


class ShopBooksDocumentListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    documents = DocumentsService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = self.documents.list_documents(
            tenant=request.current_tenant,
            business=business,
            doc_type=request.query_params.get("doc_type") or None,
        )
        return paginated_list_response(request, qs, ShopBooksDocumentSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopBooksDocumentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        customer = None
        supplier = None
        if data.get("customer_id"):
            customer = get_object_or_404(
                Customer, tenant=request.current_tenant, business=business, id=data["customer_id"]
            )
        if data.get("supplier_id"):
            supplier = get_object_or_404(
                ShopSupplier, tenant=request.current_tenant, business=business, id=data["supplier_id"]
            )
        try:
            doc = self.documents.create_document(
                tenant=request.current_tenant,
                business=business,
                doc_type=data["doc_type"],
                lines=data["lines"],
                customer=customer,
                supplier=supplier,
                notes=data.get("notes") or "",
                document_date=data.get("document_date"),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopBooksDocumentSerializer(doc).data, status_code=status.HTTP_201_CREATED
        )


class ShopBooksDocumentConvertView(APIView):
    permission_classes = [ShopAccessPermission]
    documents = DocumentsService()

    def post(self, request: Request, document_id) -> Response:
        document = get_object_or_404(ShopBooksDocument, tenant=request.current_tenant, id=document_id)
        serializer = ShopBooksDocumentConvertSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = self.documents.convert_document(
                tenant=request.current_tenant,
                business=document.business,
                document=document,
                cash_account_id=data.get("cash_account_id"),
                amount_paid=data.get("amount_paid") or 0,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        if isinstance(result, ShopBooksVoucher):
            return success_response(ShopBooksVoucherSerializer(result).data)
        return success_response(ShopBooksDocumentSerializer(result).data)


class ShopGodownListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    godowns = GodownsService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = self.godowns.list_godowns(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopGodownSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopGodownCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        try:
            godown = self.godowns.create_godown(
                tenant=request.current_tenant,
                business=business,
                name=data["name"],
                code=data.get("code") or "",
                is_default=bool(data.get("is_default")),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopGodownSerializer(godown).data, status_code=status.HTTP_201_CREATED)


class ShopStockTransferListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    godowns = GodownsService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = self.godowns.list_transfers(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopStockTransferSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopStockTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        try:
            transfer = self.godowns.transfer_stock(
                tenant=request.current_tenant,
                business=business,
                from_godown_id=data["from_godown_id"],
                to_godown_id=data["to_godown_id"],
                lines=data["lines"],
                notes=data.get("notes") or "",
                transfer_date=data.get("transfer_date"),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(
            ShopStockTransferSerializer(transfer).data, status_code=status.HTTP_201_CREATED
        )


class ShopChequeListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    cheques = ChequesService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = self.cheques.list_cheques(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopChequeSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopChequeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        customer = None
        supplier = None
        cash_account = None
        if data.get("customer_id"):
            customer = get_object_or_404(
                Customer, tenant=request.current_tenant, business=business, id=data["customer_id"]
            )
        if data.get("supplier_id"):
            supplier = get_object_or_404(
                ShopSupplier, tenant=request.current_tenant, business=business, id=data["supplier_id"]
            )
        if data.get("cash_account_id"):
            cash_account = get_object_or_404(
                ShopCashAccount,
                tenant=request.current_tenant,
                business=business,
                id=data["cash_account_id"],
            )
        try:
            cheque = self.cheques.create_cheque(
                tenant=request.current_tenant,
                business=business,
                direction=data["direction"],
                amount=data["amount"],
                cheque_number=data["cheque_number"],
                bank_name=data.get("bank_name") or "",
                due_date=data.get("due_date"),
                customer=customer,
                supplier=supplier,
                cash_account=cash_account,
                notes=data.get("notes") or "",
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopChequeSerializer(cheque).data, status_code=status.HTTP_201_CREATED)


class ShopChequeClearView(APIView):
    permission_classes = [ShopAccessPermission]
    cheques = ChequesService()

    def post(self, request: Request, cheque_id) -> Response:
        cheque = get_object_or_404(ShopCheque, tenant=request.current_tenant, id=cheque_id)
        serializer = ShopChequeClearSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        try:
            cheque = self.cheques.clear_cheque(
                tenant=request.current_tenant,
                business=cheque.business,
                cheque=cheque,
                cash_account_id=serializer.validated_data.get("cash_account_id"),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopChequeSerializer(cheque).data)


class ShopChequeBounceView(APIView):
    permission_classes = [ShopAccessPermission]
    cheques = ChequesService()

    def post(self, request: Request, cheque_id) -> Response:
        cheque = get_object_or_404(ShopCheque, tenant=request.current_tenant, id=cheque_id)
        try:
            cheque = self.cheques.bounce_cheque(
                tenant=request.current_tenant, business=cheque.business, cheque=cheque
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopChequeSerializer(cheque).data)


class ShopLoanListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    loans = LoansService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        qs = self.loans.list_loans(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopLoanSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopLoanCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        customer = None
        supplier = None
        if data.get("customer_id"):
            customer = get_object_or_404(
                Customer, tenant=request.current_tenant, business=business, id=data["customer_id"]
            )
        if data.get("supplier_id"):
            supplier = get_object_or_404(
                ShopSupplier, tenant=request.current_tenant, business=business, id=data["supplier_id"]
            )
        try:
            loan = self.loans.create_loan(
                tenant=request.current_tenant,
                business=business,
                title=data["title"],
                principal=data["principal"],
                party_kind=data.get("party_kind") or "customer",
                customer=customer,
                supplier=supplier,
                interest_rate=data.get("interest_rate") or 0,
                start_date=data.get("start_date"),
                notes=data.get("notes") or "",
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopLoanSerializer(loan).data, status_code=status.HTTP_201_CREATED)


class ShopLoanRepaymentView(APIView):
    permission_classes = [ShopAccessPermission]
    loans = LoansService()

    def post(self, request: Request, loan_id) -> Response:
        loan = get_object_or_404(ShopLoan, tenant=request.current_tenant, id=loan_id)
        serializer = ShopLoanRepaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            loan = self.loans.record_repayment(
                tenant=request.current_tenant,
                business=loan.business,
                loan=loan,
                amount=data["amount"],
                notes=data.get("notes") or "",
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopLoanSerializer(loan).data)
