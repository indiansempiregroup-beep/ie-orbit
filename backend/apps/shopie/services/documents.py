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
        qs = ShopBooksDocument.objects.filter(tenant=tenant, business=business)
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
            product = ShopProduct.objects.get(tenant=tenant, business=business, id=raw["product_id"])
            qty = Decimal(str(raw.get("quantity") or raw.get("qty") or "1"))
            unit_price = Decimal(
                str(raw.get("unit_price") if raw.get("unit_price") is not None else raw.get("rate") if raw.get("rate") is not None else product.price)
            )
            tax_rate = Decimal(
                str(
                    raw.get("tax_rate")
                    if raw.get("tax_rate") is not None
                    else raw.get("gst_rate")
                    if raw.get("gst_rate") is not None
                    else (product.gst_rate if hasattr(product, "gst_rate") else product.tax_rate)
                )
            )
            line_subtotal = (unit_price * qty).quantize(Decimal("0.01"))
            line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
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
                    "line_total": str(line_subtotal + line_tax),
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
    def convert_document(
        self,
        *,
        tenant: Tenant,
        business: Business,
        document: ShopBooksDocument,
        cash_account_id=None,
        amount_paid: Any = 0,
    ) -> ShopBooksVoucher | ShopBooksDocument:
        if document.status == BooksDocumentStatus.CONVERTED:
            raise ValidationError({"status": "Document already converted."})
        if document.status == BooksDocumentStatus.DISPATCHED:
            raise ValidationError({"status": "Delivery challan already dispatched."})
        if document.status == BooksDocumentStatus.CANCELLED:
            raise ValidationError({"status": "Cancelled documents cannot be converted."})

        lines = [
            {
                "product_id": row.get("product_id"),
                "name": row.get("name"),
                "qty": row.get("qty") or row.get("quantity") or "1",
                "rate": row.get("rate") or row.get("unit_price") or "0",
                "gst_rate": row.get("gst_rate") or row.get("tax_rate") or "0",
            }
            for row in (document.line_items or [])
            if row.get("product_id")
        ]

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
            from apps.shopie.models import StockMovementType
            from apps.shopie.services.catalog import CatalogService

            catalog = CatalogService()
            for row in lines:
                product = ShopProduct.objects.get(
                    tenant=tenant, business=business, id=row["product_id"]
                )
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
        else:
            raise ValidationError({"doc_type": "Unsupported conversion."})

        document.status = BooksDocumentStatus.CONVERTED
        document.converted_voucher = voucher
        document.save(update_fields=["status", "converted_voucher", "updated_at", "version"])
        return voucher
