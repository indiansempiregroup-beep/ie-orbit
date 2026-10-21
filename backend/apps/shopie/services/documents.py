from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    BooksDocumentStatus,
    BooksDocumentType,
    ShopBooksDocument,
    ShopBooksVoucher,
    ShopProduct,
    ShopSupplier,
)
from apps.shopie.services.books import BooksService
from apps.tenancy.models import Tenant

_UNSET = object()


def _q(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


class DocumentsService:
    books = BooksService()

    def list_documents(
        self,
        *,
        tenant: Tenant,
        business: Business,
        doc_type: str | None = None,
    ):
        qs = ShopBooksDocument.objects.filter(tenant=tenant, business=business).select_related(
            "customer", "supplier"
        )
        if doc_type:
            qs = qs.filter(doc_type=doc_type)
        return qs

    def _next_number(self, *, business: Business, prefix: str) -> str:
        stamp = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"{prefix}-{business.business_code[:8].upper()}-{stamp}"

    def _serialize_lines(
        self, *, tenant: Tenant, business: Business, lines: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], Decimal, Decimal, Decimal]:
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})
        subtotal = Decimal("0.00")
        tax_total = Decimal("0.00")
        serialized: list[dict[str, Any]] = []
        for raw in lines:
            product_id = raw.get("product_id") or raw.get("product")
            if not product_id:
                raise ValidationError({"lines": "Each line needs a product."})
            try:
                product = ShopProduct.objects.get(tenant=tenant, business=business, id=product_id)
            except ShopProduct.DoesNotExist as exc:
                raise ValidationError({"lines": "One or more products were not found."}) from exc
            qty_raw = raw.get("quantity")
            if qty_raw is None:
                qty_raw = raw.get("qty") or "1"
            qty = Decimal(str(qty_raw))
            if qty <= 0:
                raise ValidationError({"lines": "Quantity must be greater than zero."})
            if raw.get("unit_price") is not None:
                price_raw = raw.get("unit_price")
            elif raw.get("rate") is not None:
                price_raw = raw.get("rate")
            else:
                price_raw = product.price
            unit_price = Decimal(str(price_raw))
            tax_source = raw.get("tax_rate")
            if tax_source is None:
                tax_source = raw.get("gst_rate")
            if tax_source is None:
                tax_source = product.gst_rate if hasattr(product, "gst_rate") else product.tax_rate
            tax_rate = Decimal(str(tax_source))
            product_meta = product.metadata if isinstance(product.metadata, dict) else {}
            if raw.get("tax_inclusive") is not None:
                tax_inclusive = bool(raw.get("tax_inclusive"))
            else:
                tax_inclusive = bool(product_meta.get("tax_inclusive"))
            gross = (unit_price * qty).quantize(Decimal("0.01"))
            if tax_inclusive and tax_rate > 0:
                line_total = gross
                line_subtotal = (gross * Decimal("100") / (Decimal("100") + tax_rate)).quantize(
                    Decimal("0.01")
                )
                line_tax = (line_total - line_subtotal).quantize(Decimal("0.01"))
            else:
                line_subtotal = gross
                line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
                line_total = line_subtotal + line_tax
            serialized.append(
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "quantity": str(qty),
                    "qty": str(qty),
                    "unit_price": str(unit_price),
                    "rate": str(unit_price),
                    "tax_rate": str(tax_rate),
                    "gst_rate": str(tax_rate),
                    "tax_inclusive": tax_inclusive,
                    "line_total": str(line_total),
                }
            )
            subtotal += line_subtotal
            tax_total += line_tax
        return serialized, subtotal, tax_total, subtotal + tax_total

    @transaction.atomic
    def create_document(
        self,
        *,
        tenant: Tenant,
        business: Business,
        doc_type: str,
        lines: list[dict[str, Any]],
        customer: Customer | None = None,
        supplier: ShopSupplier | None = None,
        notes: str = "",
        document_date=None,
        document_number: str | None = None,
    ) -> ShopBooksDocument:
        doc_type = (doc_type or "").strip().lower()
        if doc_type not in {c.value for c in BooksDocumentType}:
            raise ValidationError({"doc_type": f"Unsupported doc_type '{doc_type}'."})
        if doc_type in {BooksDocumentType.SALE_ORDER, BooksDocumentType.DELIVERY_CHALLAN, BooksDocumentType.JOB_WORK}:
            pass  # customer optional
        if doc_type == BooksDocumentType.PURCHASE_ORDER and supplier is None:
            raise ValidationError({"supplier_id": "A supplier is required for purchase orders."})

        serialized, subtotal, tax_total, total = self._serialize_lines(
            tenant=tenant, business=business, lines=lines
        )
        prefixes = {
            BooksDocumentType.SALE_ORDER: "SO",
            BooksDocumentType.PURCHASE_ORDER: "PO",
            BooksDocumentType.DELIVERY_CHALLAN: "DC",
            BooksDocumentType.JOB_WORK: "JW",
        }
        return ShopBooksDocument.objects.create(
            tenant=tenant,
            business=business,
            doc_type=doc_type,
            document_number=document_number or self._next_number(business=business, prefix=prefixes[doc_type]),
            document_date=document_date or timezone.localdate(),
            status=BooksDocumentStatus.CONFIRMED,
            customer=customer,
            supplier=supplier,
            currency=business.currency or "INR",
            subtotal=subtotal,
            tax_total=tax_total,
            total=total,
            notes=notes or "",
            line_items=serialized,
        )

    @transaction.atomic
    def update_document(
        self,
        *,
        tenant: Tenant,
        business: Business,
        document: ShopBooksDocument,
        customer: Customer | None | object = _UNSET,
        supplier: ShopSupplier | None | object = _UNSET,
        notes: str | None = None,
        document_date: Any = _UNSET,
        status: str | None = None,
        lines: list[dict[str, Any]] | None = None,
    ) -> ShopBooksDocument:
        if document.status in {BooksDocumentStatus.CONVERTED, BooksDocumentStatus.CANCELLED}:
            raise ValidationError({"status": "This document cannot be updated."})
        if document.converted_voucher_id:
            raise ValidationError({"status": "Converted documents cannot be updated."})

        dispatched = document.status == BooksDocumentStatus.DISPATCHED
        if dispatched and (
            lines is not None
            or customer is not _UNSET
            or supplier is not _UNSET
            or document_date is not _UNSET
            or (status is not None and status != BooksDocumentStatus.DISPATCHED)
        ):
            raise ValidationError(
                {
                    "status": (
                        "Dispatched challans cannot change lines, party, or status. "
                        "Create an invoice instead."
                    )
                }
            )

        update_fields = ["updated_at", "version"]

        if customer is not _UNSET:
            document.customer = customer  # type: ignore[assignment]
            update_fields.append("customer")

        if supplier is not _UNSET:
            if document.doc_type == BooksDocumentType.PURCHASE_ORDER and supplier is None:
                raise ValidationError({"supplier_id": "A supplier is required for purchase orders."})
            document.supplier = supplier  # type: ignore[assignment]
            update_fields.append("supplier")

        if notes is not None:
            document.notes = notes
            update_fields.append("notes")

        if document_date is not _UNSET:
            document.document_date = document_date
            update_fields.append("document_date")

        if status is not None and not dispatched:
            allowed = {
                BooksDocumentStatus.DRAFT,
                BooksDocumentStatus.CONFIRMED,
                BooksDocumentStatus.CANCELLED,
            }
            if status == BooksDocumentStatus.DISPATCHED:
                raise ValidationError({"status": "Use Dispatch to mark a challan as dispatched."})
            if status == BooksDocumentStatus.CONVERTED:
                raise ValidationError({"status": "Use convert to convert this document."})
            if status not in allowed:
                raise ValidationError({"status": "Invalid document status."})
            document.status = status
            update_fields.append("status")

        if lines is not None:
            serialized, subtotal, tax_total, total = self._serialize_lines(
                tenant=tenant, business=business, lines=lines
            )
            document.line_items = serialized
            document.subtotal = subtotal
            document.tax_total = tax_total
            document.total = total
            update_fields.extend(["line_items", "subtotal", "tax_total", "total"])

        document.save(update_fields=update_fields)
        return document

    def _document_lines(self, document: ShopBooksDocument) -> list[dict[str, Any]]:
        return [
            {
                "product_id": row.get("product_id"),
                "name": row.get("name"),
                "qty": row.get("qty") or row.get("quantity") or "1",
                "rate": row.get("rate") or row.get("unit_price") or "0",
                "gst_rate": row.get("gst_rate") or row.get("tax_rate") or "0",
                "tax_inclusive": row.get("tax_inclusive"),
            }
            for row in (document.line_items or [])
            if row.get("product_id")
        ]

    def _dispatch_challan(
        self,
        *,
        tenant: Tenant,
        business: Business,
        document: ShopBooksDocument,
        lines: list[dict[str, Any]],
    ) -> ShopBooksDocument:
        from apps.shopie.models import StockMovementType
        from apps.shopie.services.catalog import CatalogService

        catalog = CatalogService()
        for row in lines:
            product = ShopProduct.objects.get(tenant=tenant, business=business, id=row["product_id"])
            qty = Decimal(str(row.get("qty") or "0"))
            if qty > 0:
                catalog.adjust_stock(
                    tenant=tenant,
                    business=business,
                    product=product,
                    quantity_delta=-qty,
                    movement_type=StockMovementType.SALE,
                    reason=f"Challan {document.document_number}",
                )
        document.status = BooksDocumentStatus.DISPATCHED
        document.save(update_fields=["status", "updated_at", "version"])
        return document

    def _invoice_challan(
        self,
        *,
        tenant: Tenant,
        business: Business,
        document: ShopBooksDocument,
        lines: list[dict[str, Any]],
        cash_account_id=None,
        amount_paid: Any = 0,
        already_dispatched: bool,
    ) -> ShopBooksVoucher:
        voucher = self.books.create_sale_voucher(
            tenant=tenant,
            business=business,
            data={
                "customer": document.customer,
                "lines": lines,
                "notes": document.notes or f"Invoice from challan {document.document_number}",
                "voucher_date": timezone.localdate(),
                "amount_paid": amount_paid,
                "cash_account_id": cash_account_id,
                # Stock already left on dispatch — do not deduct again.
                "adjust_stock": not already_dispatched,
                "metadata": {
                    "source_document_id": str(document.id),
                    "source_document_number": document.document_number,
                    "source_doc_type": BooksDocumentType.DELIVERY_CHALLAN,
                },
            },
        )
        document.status = BooksDocumentStatus.CONVERTED
        document.converted_voucher = voucher
        document.save(update_fields=["status", "converted_voucher", "updated_at", "version"])
        return voucher

    @transaction.atomic
    def convert_document(
        self,
        *,
        tenant: Tenant,
        business: Business,
        document: ShopBooksDocument,
        cash_account_id=None,
        amount_paid: Any = 0,
        action: str | None = None,
    ) -> ShopBooksVoucher | ShopBooksDocument:
        action_norm = (action or "").strip().lower()
        if document.status == BooksDocumentStatus.CONVERTED:
            raise ValidationError({"status": "Document already converted."})
        if document.status == BooksDocumentStatus.CANCELLED:
            raise ValidationError({"status": "Cancelled documents cannot be converted."})

        lines = self._document_lines(document)

        if document.doc_type == BooksDocumentType.SALE_ORDER:
            voucher = self.books.create_sale_voucher(
                tenant=tenant,
                business=business,
                data={
                    "customer": document.customer,
                    "lines": lines,
                    "notes": document.notes,
                    "voucher_date": document.document_date,
                    "amount_paid": amount_paid,
                    "cash_account_id": cash_account_id,
                    "metadata": {"source_document_id": str(document.id)},
                },
            )
        elif document.doc_type == BooksDocumentType.PURCHASE_ORDER:
            voucher = self.books.create_purchase_voucher(
                tenant=tenant,
                business=business,
                data={
                    "supplier": document.supplier,
                    "lines": lines,
                    "notes": document.notes,
                    "voucher_date": document.document_date,
                    "amount_paid": amount_paid,
                    "cash_account_id": cash_account_id,
                    "metadata": {"source_document_id": str(document.id)},
                },
            )
        elif document.doc_type == BooksDocumentType.JOB_WORK:
            voucher = self.books.create_sale_voucher(
                tenant=tenant,
                business=business,
                data={
                    "customer": document.customer,
                    "lines": lines,
                    "notes": document.notes or "Job work",
                    "voucher_date": document.document_date,
                    "amount_paid": amount_paid,
                    "cash_account_id": cash_account_id,
                    "adjust_stock": False,
                    "metadata": {"source_document_id": str(document.id), "job_work": True},
                },
            )
        elif document.doc_type == BooksDocumentType.DELIVERY_CHALLAN:
            to_invoice = action_norm in {"to_invoice", "invoice", "convert"}
            already_dispatched = document.status == BooksDocumentStatus.DISPATCHED

            if already_dispatched and not to_invoice:
                raise ValidationError({"status": "Delivery challan already dispatched."})
            if document.status not in {
                BooksDocumentStatus.DRAFT,
                BooksDocumentStatus.CONFIRMED,
                BooksDocumentStatus.DISPATCHED,
            }:
                raise ValidationError({"status": "Delivery challan cannot be converted."})

            if to_invoice:
                return self._invoice_challan(
                    tenant=tenant,
                    business=business,
                    document=document,
                    lines=lines,
                    cash_account_id=cash_account_id,
                    amount_paid=amount_paid,
                    already_dispatched=already_dispatched,
                )
            return self._dispatch_challan(
                tenant=tenant,
                business=business,
                document=document,
                lines=lines,
            )
        else:
            raise ValidationError({"doc_type": "Unsupported conversion."})

        document.status = BooksDocumentStatus.CONVERTED
        document.converted_voucher = voucher
        document.save(update_fields=["status", "converted_voucher", "updated_at", "version"])
        return voucher
