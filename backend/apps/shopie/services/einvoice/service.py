from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.businesses.models import Business
from apps.shopie.models import (
    EInvoiceDocType,
    EInvoiceStatus,
    EWayBillStatus,
    EWaySupplyType,
    ShopBooksVoucher,
    ShopBusinessSettings,
    ShopEInvoice,
    ShopEWayBill,
    VoucherStatus,
    VoucherType,
)
from apps.shopie.services.einvoice.payload import build_einvoice_payload
from apps.shopie.services.einvoice.providers import get_provider
from apps.shopie.services.einvoice.state_codes import resolve_state_code
from apps.tenancy.models import Tenant

_EINVOICE_ELIGIBLE_VOUCHER_TYPES = {VoucherType.SALE, VoucherType.CREDIT_NOTE}
_EWAY_ELIGIBLE_VOUCHER_TYPES = {
    VoucherType.SALE,
    VoucherType.PURCHASE,
    VoucherType.CREDIT_NOTE,
    VoucherType.DEBIT_NOTE,
}
_DOC_TYPE_BY_VOUCHER_TYPE = {
    VoucherType.SALE: EInvoiceDocType.INVOICE,
    VoucherType.CREDIT_NOTE: EInvoiceDocType.CREDIT_NOTE,
    VoucherType.DEBIT_NOTE: EInvoiceDocType.DEBIT_NOTE,
}

_GST_DATETIME_FORMATS = ("%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y")


def _parse_gst_datetime(raw: Any) -> datetime:
    if isinstance(raw, datetime):
        return raw if timezone.is_aware(raw) else timezone.make_aware(raw)
    text = str(raw or "").strip()
    for fmt in _GST_DATETIME_FORMATS:
        try:
            parsed = datetime.strptime(text, fmt)
            return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        except ValueError:
            continue
    return timezone.now()


def _error_message(exc: ValidationError) -> str:
    if hasattr(exc, "message_dict"):
        return "; ".join(f"{k}: {', '.join(v)}" for k, v in exc.message_dict.items())
    if hasattr(exc, "messages"):
        return "; ".join(exc.messages)
    return str(exc)


class GstComplianceService:
    """Orchestrates GST e-invoice (IRN) and e-way bill generation for ShopIE."""

    # ------------------------------------------------------------------
    # Compliance settings
    # ------------------------------------------------------------------
    def get_or_create_settings(self, *, tenant: Tenant, business: Business) -> ShopBusinessSettings:
        settings, _created = ShopBusinessSettings.objects.get_or_create(
            tenant=tenant, business=business
        )
        return settings

    @transaction.atomic
    def update_compliance_settings(
        self, *, tenant: Tenant, business: Business, data: dict[str, Any]
    ) -> ShopBusinessSettings:
        settings = self.get_or_create_settings(tenant=tenant, business=business)
        if "einvoice_enabled" in data and data["einvoice_enabled"] is not None:
            settings.einvoice_enabled = bool(data["einvoice_enabled"])
        if "eway_enabled" in data and data["eway_enabled"] is not None:
            settings.eway_enabled = bool(data["eway_enabled"])
        if "gst_compliance" in data and isinstance(data["gst_compliance"], dict):
            merged = dict(settings.gst_compliance or {})
            merged.update(data["gst_compliance"])
            settings.gst_compliance = merged
        settings.save(
            update_fields=[
                "einvoice_enabled",
                "eway_enabled",
                "gst_compliance",
                "updated_at",
                "version",
            ]
        )
        return settings

    # ------------------------------------------------------------------
    # E-invoice (IRN)
    # ------------------------------------------------------------------
    @transaction.atomic
    def generate_einvoice(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher_id: UUID | str,
        allow_b2c: bool = False,
    ) -> ShopEInvoice:
        try:
            voucher = ShopBooksVoucher.objects.select_for_update().get(
                tenant=tenant, business=business, id=voucher_id
            )
        except ShopBooksVoucher.DoesNotExist as exc:
            raise ValidationError({"voucher_id": "Voucher not found."}) from exc

        if voucher.voucher_type not in _EINVOICE_ELIGIBLE_VOUCHER_TYPES:
            raise ValidationError(
                {
                    "voucher_type": (
                        "E-invoices can only be generated for sale or credit note vouchers."
                    )
                }
            )
        if voucher.status != VoucherStatus.CONFIRMED:
            raise ValidationError(
                {"status": "Only confirmed vouchers can be submitted for e-invoicing."}
            )

        settings = self.get_or_create_settings(tenant=tenant, business=business)
        if not settings.einvoice_enabled:
            raise ValidationError(
                {"einvoice_enabled": "E-invoicing is not enabled for this business."}
            )

        einvoice, _created = ShopEInvoice.objects.get_or_create(
            tenant=tenant,
            business=business,
            voucher=voucher,
            defaults={
                "doc_type": _DOC_TYPE_BY_VOUCHER_TYPE.get(
                    voucher.voucher_type, EInvoiceDocType.INVOICE
                )
            },
        )
        if einvoice.status == EInvoiceStatus.GENERATED:
            return einvoice

        try:
            payload = build_einvoice_payload(
                business, settings, voucher, voucher.customer, allow_b2c=allow_b2c
            )
        except ValidationError as exc:
            einvoice.status = EInvoiceStatus.FAILED
            einvoice.error_message = _error_message(exc)
            einvoice.save(update_fields=["status", "error_message", "updated_at", "version"])
            raise

        einvoice.request_payload = payload
        einvoice.status = EInvoiceStatus.PENDING
        einvoice.error_message = ""
        einvoice.save(
            update_fields=["request_payload", "status", "error_message", "updated_at", "version"]
        )

        provider = get_provider(settings)
        try:
            response = provider.generate_irn(payload)
        except ValidationError as exc:
            einvoice.status = EInvoiceStatus.FAILED
            einvoice.error_message = _error_message(exc)
            einvoice.save(update_fields=["status", "error_message", "updated_at", "version"])
            raise

        einvoice.response_payload = response
        einvoice.irn = str(response.get("Irn") or "")
        einvoice.ack_no = str(response.get("AckNo") or "")
        einvoice.ack_date = _parse_gst_datetime(response.get("AckDt"))
        einvoice.signed_qr = str(response.get("SignedQRCode") or "")
        einvoice.signed_invoice = str(response.get("SignedInvoice") or "")
        einvoice.status = EInvoiceStatus.GENERATED
        einvoice.error_message = ""
        einvoice.save(
            update_fields=[
                "response_payload",
                "irn",
                "ack_no",
                "ack_date",
                "signed_qr",
                "signed_invoice",
                "status",
                "error_message",
                "updated_at",
                "version",
            ]
        )
        return einvoice

    @transaction.atomic
    def cancel_einvoice(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher_id: UUID | str,
        reason: str,
    ) -> ShopEInvoice:
        if not str(reason or "").strip():
            raise ValidationError({"reason": "A cancellation reason is required."})
        try:
            einvoice = ShopEInvoice.objects.select_for_update().get(
                tenant=tenant, business=business, voucher_id=voucher_id
            )
        except ShopEInvoice.DoesNotExist as exc:
            raise ValidationError({"voucher_id": "No e-invoice found for this voucher."}) from exc

        if einvoice.status != EInvoiceStatus.GENERATED:
            raise ValidationError({"status": "Only generated e-invoices can be cancelled."})

        settings = self.get_or_create_settings(tenant=tenant, business=business)
        provider = get_provider(settings)
        now = timezone.now()
        try:
            response = provider.cancel_irn(einvoice.irn, reason, now)
        except ValidationError as exc:
            einvoice.error_message = _error_message(exc)
            einvoice.save(update_fields=["error_message", "updated_at", "version"])
            raise

        einvoice.response_payload = {**(einvoice.response_payload or {}), "cancel": response}
        einvoice.status = EInvoiceStatus.CANCELLED
        einvoice.cancelled_at = now
        einvoice.cancel_reason = str(reason)
        einvoice.error_message = ""
        einvoice.save(
            update_fields=[
                "response_payload",
                "status",
                "cancelled_at",
                "cancel_reason",
                "error_message",
                "updated_at",
                "version",
            ]
        )
        return einvoice

    def get_einvoice_for_voucher(
        self, *, tenant: Tenant, business: Business, voucher_id: UUID | str
    ) -> ShopEInvoice | None:
        return ShopEInvoice.objects.filter(
            tenant=tenant, business=business, voucher_id=voucher_id
        ).first()

    def list_einvoices(
        self, *, tenant: Tenant, business: Business, status: str | None = None
    ) -> QuerySet[ShopEInvoice]:
        qs = ShopEInvoice.objects.filter(tenant=tenant, business=business).select_related("voucher")
        if status:
            qs = qs.filter(status=status)
        return qs

    # ------------------------------------------------------------------
    # E-way bill
    # ------------------------------------------------------------------
    def _build_eway_payload(
        self,
        *,
        voucher: ShopBooksVoucher,
        einvoice: ShopEInvoice | None,
        transport: dict[str, Any],
    ) -> dict[str, Any]:
        default_doc_type = _DOC_TYPE_BY_VOUCHER_TYPE.get(voucher.voucher_type, "INV")
        doc_type = str(
            transport.get("doc_type") or (einvoice.doc_type if einvoice else default_doc_type)
        )
        return {
            "supplyType": transport.get("supply_type") or EWaySupplyType.OUTWARD,
            "subSupplyType": str(transport.get("sub_supply_type") or "1"),
            "docType": doc_type,
            "docNo": voucher.voucher_number,
            "docDate": voucher.voucher_date.strftime("%d/%m/%Y"),
            "irn": einvoice.irn if einvoice else "",
            "transporterId": transport.get("transporter_id") or "",
            "transporterName": transport.get("transporter_name") or "",
            "transMode": str(transport.get("transport_mode") or "1"),
            "vehicleNo": transport.get("vehicle_no") or "",
            "vehicleType": transport.get("vehicle_type") or "R",
            "totalValue": float(voucher.total),
            "fromPlace": transport.get("from_place") or "",
            "fromState": resolve_state_code(transport.get("from_state_code")) or "",
            "toPlace": transport.get("to_place") or "",
            "toState": resolve_state_code(transport.get("to_state_code")) or "",
            "distance": int(transport.get("distance_km") or 0),
        }

    @transaction.atomic
    def generate_eway(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher_id: UUID | str,
        transport: dict[str, Any],
    ) -> ShopEWayBill:
        try:
            voucher = ShopBooksVoucher.objects.select_for_update().get(
                tenant=tenant, business=business, id=voucher_id
            )
        except ShopBooksVoucher.DoesNotExist as exc:
            raise ValidationError({"voucher_id": "Voucher not found."}) from exc

        if voucher.voucher_type not in _EWAY_ELIGIBLE_VOUCHER_TYPES:
            raise ValidationError(
                {
                    "voucher_type": (
                        "E-way bills can only be generated for sale, purchase, credit note, "
                        "or debit note vouchers."
                    )
                }
            )
        if voucher.status != VoucherStatus.CONFIRMED:
            raise ValidationError(
                {"status": "Only confirmed vouchers can be submitted for e-way billing."}
            )

        settings = self.get_or_create_settings(tenant=tenant, business=business)
        if not settings.eway_enabled:
            raise ValidationError(
                {"eway_enabled": "E-way billing is not enabled for this business."}
            )

        einvoice = ShopEInvoice.objects.filter(
            tenant=tenant, business=business, voucher=voucher, status=EInvoiceStatus.GENERATED
        ).first()

        payload = self._build_eway_payload(voucher=voucher, einvoice=einvoice, transport=transport)

        eway = ShopEWayBill.objects.create(
            tenant=tenant,
            business=business,
            voucher=voucher,
            einvoice=einvoice,
            status=EWayBillStatus.DRAFT,
            supply_type=str(transport.get("supply_type") or EWaySupplyType.OUTWARD),
            sub_supply_type=str(transport.get("sub_supply_type") or "1"),
            doc_type=str(payload["docType"]),
            transporter_id=str(transport.get("transporter_id") or ""),
            transporter_name=str(transport.get("transporter_name") or ""),
            transport_mode=str(transport.get("transport_mode") or "1"),
            vehicle_no=str(transport.get("vehicle_no") or ""),
            vehicle_type=str(transport.get("vehicle_type") or "R"),
            distance_km=int(transport.get("distance_km") or 0),
            from_place=str(transport.get("from_place") or ""),
            from_state_code=resolve_state_code(transport.get("from_state_code")) or "",
            to_place=str(transport.get("to_place") or ""),
            to_state_code=resolve_state_code(transport.get("to_state_code")) or "",
            request_payload=payload,
        )

        provider = get_provider(settings)
        try:
            response = provider.generate_eway(payload)
        except ValidationError as exc:
            eway.status = EWayBillStatus.FAILED
            eway.error_message = _error_message(exc)
            eway.save(update_fields=["status", "error_message", "updated_at", "version"])
            raise

        eway.response_payload = response
        eway.ewb_no = str(response.get("EwbNo") or "")
        eway.ewb_date = _parse_gst_datetime(response.get("EwbDt"))
        eway.valid_upto = _parse_gst_datetime(response.get("EwbValidTill"))
        eway.status = EWayBillStatus.GENERATED
        eway.error_message = ""
        eway.save(
            update_fields=[
                "response_payload",
                "ewb_no",
                "ewb_date",
                "valid_upto",
                "status",
                "error_message",
                "updated_at",
                "version",
            ]
        )
        return eway

    @transaction.atomic
    def cancel_eway(
        self,
        *,
        tenant: Tenant,
        business: Business,
        eway_id: UUID | str,
        reason: str,
    ) -> ShopEWayBill:
        if not str(reason or "").strip():
            raise ValidationError({"reason": "A cancellation reason is required."})
        try:
            eway = ShopEWayBill.objects.select_for_update().get(
                tenant=tenant, business=business, id=eway_id
            )
        except ShopEWayBill.DoesNotExist as exc:
            raise ValidationError({"eway_id": "E-way bill not found."}) from exc

        if eway.status != EWayBillStatus.GENERATED:
            raise ValidationError({"status": "Only generated e-way bills can be cancelled."})

        settings = self.get_or_create_settings(tenant=tenant, business=business)
        provider = get_provider(settings)
        try:
            response = provider.cancel_eway(eway.ewb_no, reason)
        except ValidationError as exc:
            eway.error_message = _error_message(exc)
            eway.save(update_fields=["error_message", "updated_at", "version"])
            raise

        eway.response_payload = {**(eway.response_payload or {}), "cancel": response}
        eway.status = EWayBillStatus.CANCELLED
        eway.cancelled_at = timezone.now()
        eway.cancel_reason = str(reason)
        eway.error_message = ""
        eway.save(
            update_fields=[
                "response_payload",
                "status",
                "cancelled_at",
                "cancel_reason",
                "error_message",
                "updated_at",
                "version",
            ]
        )
        return eway

    def list_eway_bills(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher_id: UUID | str | None = None,
        status: str | None = None,
    ) -> QuerySet[ShopEWayBill]:
        qs = ShopEWayBill.objects.filter(tenant=tenant, business=business).select_related(
            "voucher", "einvoice"
        )
        if voucher_id:
            qs = qs.filter(voucher_id=voucher_id)
        if status:
            qs = qs.filter(status=status)
        return qs
