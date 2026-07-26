from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.customers.api.permissions import CustomerAccessPermission
from apps.customers.api.serializers import (
    BulkCustomerActionSerializer,
    CustomerBorrowBalanceSerializer,
    CustomerBorrowLedgerSerializer,
    CustomerBorrowPaymentSerializer,
    CustomerExportJobSerializer,
    CustomerImportJobSerializer,
    CustomerMergeRecordSerializer,
    CustomerMergeSerializer,
    CustomerSerializer,
    CustomerTagSerializer,
)
from apps.customers.models import Customer, CustomerTag
from apps.customers.repositories import CustomerRepository
from apps.customers.services import BorrowService, CustomerSearchService, CustomerService


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError(list(exc.messages))
    return ValidationError(str(exc))


class CustomerViewSet(viewsets.ViewSet):
    permission_classes = [CustomerAccessPermission]
    serializer_class = CustomerSerializer
    repository = CustomerRepository()
    service = CustomerService(repository=repository)
    search_service = CustomerSearchService(repository=repository)
    borrow = BorrowService()

    @extend_schema(
        tags=["Customers"],
        parameters=[
            OpenApiParameter("q", str, description="Search name, email, phone, or code."),
            OpenApiParameter("business", str, description="Business UUID."),
            OpenApiParameter("status", str, description="Customer status."),
            OpenApiParameter("tags", str, description="Comma-separated tags."),
        ],
        responses={200: CustomerSerializer(many=True)},
    )
    def list(self, request: Request) -> Response:
        queryset = self.search_service.search(
            tenant=request.current_tenant,
            user=request.user,
            params=request.query_params,
            request=request,
        )
        return paginated_list_response(
            request,
            queryset,
            CustomerSerializer,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Customers"], request=CustomerSerializer, responses={201: CustomerSerializer}
    )
    def create(self, request: Request) -> Response:
        serializer = CustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        send_registration_invite = bool(request.data.get("send_registration_invite", True))
        customer = self.service.create_customer(
            data=dict(serializer.validated_data),
            tenant=request.current_tenant,
            actor=request.user,
            send_registration_invite=send_registration_invite,
        )
        return success_response(
            CustomerSerializer(customer).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Customers"], responses={200: CustomerSerializer})
    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        customer = self.get_object(request=request, customer_id=pk)
        self.service.ensure_foundation_records(customer)
        customer = (
            Customer.objects.select_related("borrow_account", "business")
            .filter(id=customer.id)
            .first()
            or customer
        )
        return success_response(
            CustomerSerializer(customer).data, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(tags=["Customers"], responses={200: CustomerBorrowBalanceSerializer})
    def borrow_balance(self, request: Request, pk: str | None = None) -> Response:
        customer = self.get_object(request=request, customer_id=pk)
        payload = self.borrow.get_balance(
            tenant=request.current_tenant,
            business=customer.business,
            customer=customer,
        )
        return success_response(payload, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["Customers"], responses={200: CustomerBorrowLedgerSerializer(many=True)})
    def borrow_ledger(self, request: Request, pk: str | None = None) -> Response:
        customer = self.get_object(request=request, customer_id=pk)
        rows = self.borrow.list_ledger(
            tenant=request.current_tenant,
            business=customer.business,
            customer=customer,
        )
        data = [
            {
                "id": row.id,
                "entry_type": row.entry_type,
                "amount": row.amount,
                "balance_after": row.balance_after,
                "payment_method": row.payment_method,
                "notes": row.notes,
                "order_id": row.order_id,
                "order_number": row.order_number,
                "created_at": row.created_at,
            }
            for row in rows[:100]
        ]
        return success_response(data, request_id=getattr(request, "request_id", None))

    @extend_schema(
        tags=["Customers"],
        request=CustomerBorrowPaymentSerializer,
        responses={200: OpenApiResponse(description="Borrow payment recorded.")},
    )
    def borrow_payment(self, request: Request, pk: str | None = None) -> Response:
        customer = self.get_object(request=request, customer_id=pk)
        serializer = CustomerBorrowPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = self.borrow.record_payment(
                tenant=request.current_tenant,
                business=customer.business,
                customer=customer,
                amount=data["amount"],
                payment_method=data.get("payment_method") or "cash",
                notes=data.get("notes") or "",
                order_id=data.get("order_id"),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(
        tags=["Customers"], request=CustomerSerializer, responses={200: CustomerSerializer}
    )
    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        customer = self.get_object(request=request, customer_id=pk)
        serializer = CustomerSerializer(customer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        customer = self.service.update_customer(
            customer=customer,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            CustomerSerializer(customer).data, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(
        tags=["Customers"], responses={204: OpenApiResponse(description="Customer archived.")}
    )
    def destroy(self, request: Request, pk: str | None = None) -> Response:
        customer = self.get_object(request=request, customer_id=pk)
        self.service.archive_customer(customer=customer, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(tags=["Customers"], responses={200: CustomerSerializer})
    def restore(self, request: Request, pk: str | None = None) -> Response:
        customer = get_object_or_404(
            Customer.all_objects.filter(tenant=request.current_tenant), id=pk
        )
        self.check_object_permissions(request, customer)
        customer = self.service.restore_customer(customer=customer, actor=request.user)
        return success_response(
            CustomerSerializer(customer).data, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(
        tags=["Customers"],
        request=CustomerMergeSerializer,
        responses={200: CustomerMergeRecordSerializer},
    )
    def merge(self, request: Request, pk: str | None = None) -> Response:
        source = self.get_object(request=request, customer_id=pk)
        serializer = CustomerMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = self.get_object(
            request=request, customer_id=str(serializer.validated_data["target_customer"])
        )
        record = self.service.merge_customers(
            source=source,
            target=target,
            reason=serializer.validated_data.get("reason", ""),
            actor=request.user,
        )
        return success_response(
            CustomerMergeRecordSerializer(record).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Customers"],
        request=BulkCustomerActionSerializer,
        responses={200: OpenApiResponse(description="Bulk archive completed.")},
    )
    def bulk_archive(self, request: Request) -> Response:
        serializer = BulkCustomerActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        queryset = self.repository.list_for_request(
            tenant=request.current_tenant, user=request.user
        ).filter(id__in=serializer.validated_data["ids"])
        count = 0
        for customer in queryset:
            self.service.archive_customer(customer=customer, actor=request.user)
            count += 1
        return success_response(
            {"archived": count}, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(
        tags=["Customers"],
        request=CustomerImportJobSerializer,
        responses={201: CustomerImportJobSerializer},
    )
    def import_foundation(self, request: Request) -> Response:
        serializer = CustomerImportJobSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = self.service.create_import_job(
            data=dict(serializer.validated_data), tenant=request.current_tenant
        )
        return success_response(
            CustomerImportJobSerializer(job).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Customers"],
        request=CustomerExportJobSerializer,
        responses={201: CustomerExportJobSerializer},
    )
    def export_foundation(self, request: Request) -> Response:
        serializer = CustomerExportJobSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = self.service.create_export_job(
            data=dict(serializer.validated_data), tenant=request.current_tenant
        )
        return success_response(
            CustomerExportJobSerializer(job).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    def get_object(self, *, request: Request, customer_id: str | None) -> Customer:
        customer = get_object_or_404(
            self.repository.list_for_request(tenant=request.current_tenant, user=request.user),
            id=customer_id,
        )
        self.check_object_permissions(request, customer)
        return customer


class CustomerTagViewSet(viewsets.ViewSet):
    permission_classes = [CustomerAccessPermission]
    repository = CustomerRepository()

    @extend_schema(tags=["Customer Tags"], responses={200: CustomerTagSerializer(many=True)})
    def list(self, request: Request) -> Response:
        queryset = self.repository.list_tags(
            tenant=request.current_tenant,
            user=request.user,
            business_id=request.query_params.get("business", ""),
        )
        return success_response(
            CustomerTagSerializer(queryset, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Customer Tags"],
        request=CustomerTagSerializer,
        responses={201: CustomerTagSerializer},
    )
    def create(self, request: Request) -> Response:
        serializer = CustomerTagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = CustomerTag(tenant=request.current_tenant, **serializer.validated_data)
        tag.full_clean()
        tag.save()
        return success_response(
            CustomerTagSerializer(tag).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )
