from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from apps.businesses.models import Business
from apps.shopie.models import ShopBooksVoucher, ShopProduct, ShopSupplier, VoucherType
from apps.shopie.services.books import BooksService
from apps.shopie.services.catalog import CatalogService
from apps.billing.services.region import saas_currency_for_business
from apps.shopie.services.smart_lookup import SmartLookupService
from apps.shopie.services.suppliers import SupplierService
from apps.tenancy.models import Tenant

logger = logging.getLogger(__name__)
_CATALOG_IMAGE_LOOKUP_CAP = 8


def _text(value: Any) -> str:
    return str(value or "").strip()


def _money(value: Any) -> str:
    raw = _text(value).replace(",", "")
    if not raw:
        return ""
    try:
        return str(Decimal(raw))
    except (InvalidOperation, ValueError):
        return raw


def _qty(value: Any) -> str:
    raw = _text(value).replace(",", "")
    if not raw:
        return "1"
    try:
        qty = Decimal(raw)
    except (InvalidOperation, ValueError):
        return "1"
    return str(qty if qty > 0 else Decimal("1"))


def _as_bool(value: Any) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    return _text(value).lower() in {"1", "true", "yes", "included", "inclusive"}


def _fill_if_empty(row: dict[str, Any], key: str, value: Any) -> None:
    incoming = _text(value)
    if incoming and not _text(row.get(key)):
        row[key] = incoming


def _wallet_charge_label(paise: int, currency: str) -> str:
    amount = (Decimal(paise or 0) / Decimal(100)).quantize(Decimal("0.01"))
    code = (currency or "INR").strip().upper()
    if code == "USD":
        return f"${amount}"
    return f"₹{amount}"


def _product_tax_inclusive(product: ShopProduct | None) -> bool:
    if product is None:
        return False
    meta = product.metadata if isinstance(product.metadata, dict) else {}
    return bool(meta.get("tax_inclusive"))


class InvoiceScanService:
    catalog = CatalogService()
    books = BooksService()
    suppliers = SupplierService()
    smart_lookup = SmartLookupService()

    def _ensure_platform_enabled(self, *, tenant: Tenant) -> None:
        from apps.platform_admin.feature_flags import INVOICE_SCAN_FLAG, tenant_feature_enabled

        if tenant_feature_enabled(tenant=tenant, key=INVOICE_SCAN_FLAG, default=True):
            return
        raise ValidationError({"invoice": "Invoice scan is turned off for this workspace."})

    def analyze(
        self,
        *,
        tenant: Tenant,
        business: Business,
        image_urls: list[str],
        extracted: dict[str, Any] | None = None,
        charged_paise: int = 0,
        balance_after_paise: int | None = None,
        usage_id: str = "",
        charge_message: str = "",
    ) -> dict[str, Any]:
        self._ensure_platform_enabled(tenant=tenant)
        urls = [_text(url) for url in image_urls if _text(url)]
        charge_currency = saas_currency_for_business(business) or "INR"
        if extracted is None:
            vision = self.smart_lookup.invoice_vision(tenant=tenant, business=business, image_urls=urls)
            if not vision.get("ok"):
                return {
                    "ok": False,
                    "source": vision.get("source") or "gemini_invoice_error",
                    "message": vision.get("message") or "Could not read that invoice.",
                    "charged_paise": int(vision.get("charged_paise") or 0),
                    "balance_after_paise": vision.get("balance_after_paise"),
                    "charge_currency": str(vision.get("charge_currency") or charge_currency),
                    "usage_id": "",
                    "draft": None,
                }
            extracted = vision.get("data") or {}
            charged_paise = int(vision.get("charged_paise") or 0)
            balance_after_paise = vision.get("balance_after_paise")
            usage_id = str(vision.get("usage_id") or "")
            charge_message = str(vision.get("message") or "")
            charge_currency = str(vision.get("charge_currency") or charge_currency)
        if not isinstance(extracted, dict):
            extracted = {}

        header = self._normalize_header(extracted)
        supplier = self._match_supplier(tenant=tenant, business=business, header=header)
        lines = [
            self._match_line(tenant=tenant, business=business, raw=row)
            for row in (extracted.get("lines") if isinstance(extracted.get("lines"), list) else [])
        ]
        lines = [row for row in lines if row.get("name") or row.get("barcode") or row.get("sku")]
        self._attach_catalog_previews(lines)
        default_currency = _text(getattr(business, "currency", "")) or "INR"
        for row in lines:
            if not _text(row.get("currency")):
                row["currency"] = default_currency
        line_total = Decimal("0")
        for row in lines:
            try:
                line_total += Decimal(str(row.get("line_total") or "0") or "0")
            except (InvalidOperation, ValueError):
                continue
        printed_total = header.get("grand_total") or ""
        totals_mismatch = False
        if printed_total:
            try:
                printed = Decimal(str(printed_total))
                totals_mismatch = abs(printed - line_total) > Decimal("1.00")
            except (InvalidOperation, ValueError):
                totals_mismatch = False

        duplicate = self._duplicate_warning(
            tenant=tenant,
            business=business,
            supplier_id=supplier.get("supplier_id"),
            invoice_number=header.get("invoice_number") or "",
        )
        draft = {
            "image_urls": urls,
            "header": header,
            "supplier": supplier,
            "lines": lines,
            "line_total": str(line_total),
            "totals_mismatch": totals_mismatch,
            "duplicate": duplicate,
        }
        if not charge_message:
            if charged_paise > 0:
                charge_message = (
                    f"{_wallet_charge_label(charged_paise, charge_currency)} charged to AI wallet for this invoice scan."
                )
            else:
                charge_message = "Invoice read. No AI wallet charge."
        return {
            "ok": True,
            "source": "gemini_invoice",
            "message": charge_message,
            "charged_paise": charged_paise,
            "balance_after_paise": balance_after_paise,
            "charge_currency": charge_currency,
            "usage_id": usage_id,
            "draft": draft,
        }

    @transaction.atomic
    def confirm(
        self,
        *,
        tenant: Tenant,
        business: Business,
        draft: dict[str, Any],
        create_missing: bool = True,
        create_supplier: bool = False,
        amount_paid: str | Decimal = "0",
        cash_account_id: str | None = None,
        godown_id: str | None = None,
    ) -> dict[str, Any]:
        self._ensure_platform_enabled(tenant=tenant)
        header = draft.get("header") if isinstance(draft.get("header"), dict) else {}
        supplier_payload = draft.get("supplier") if isinstance(draft.get("supplier"), dict) else {}
        raw_lines = draft.get("lines") if isinstance(draft.get("lines"), list) else []
        supplier = self._resolve_confirm_supplier(
            tenant=tenant,
            business=business,
            payload=supplier_payload,
            header=header,
            create_supplier=create_supplier,
        )
        voucher_lines: list[dict[str, Any]] = []
        created_products: list[str] = []
        for raw in raw_lines:
            if not isinstance(raw, dict) or raw.get("skip"):
                continue
            product = self._resolve_confirm_product(
                tenant=tenant,
                business=business,
                raw=raw,
                create_missing=create_missing,
            )
            if product is None:
                continue
            if raw.get("created"):
                created_products.append(str(product.id))
            voucher_lines.append(
                {
                    "product_id": product.id,
                    "name": product.name,
                    "hsn_sac": _text(raw.get("hsn_sac")) or product.hsn_sac,
                    "qty": _qty(raw.get("qty")),
                    "rate": _money(raw.get("rate")) or str(product.purchase_price or product.price or "0"),
                    "discount": _money(raw.get("discount")) or "0",
                    "gst_rate": _money(raw.get("gst_rate")) or str(product.gst_rate or "0"),
                }
            )
        if not voucher_lines:
            raise ValueError("Select at least one invoice line to post.")

        invoice_number = _text(header.get("invoice_number"))
        voucher_date = self._parse_invoice_date(header.get("invoice_date"))
        image_urls = [_text(url) for url in (draft.get("image_urls") or []) if _text(url)]
        voucher = self.books.create_purchase_voucher(
            tenant=tenant,
            business=business,
            data={
                "supplier": supplier,
                "voucher_date": voucher_date,
                "place_of_supply": _text(header.get("place_of_supply")),
                "notes": f"Scanned invoice {invoice_number}".strip() if invoice_number else "Scanned vendor invoice",
                "amount_paid": amount_paid or "0",
                "cash_account_id": cash_account_id,
                "godown_id": godown_id,
                "lines": voucher_lines,
                "metadata": {
                    "invoice_scan": {
                        "source": "gemini_invoice",
                        "invoice_number": invoice_number,
                        "image_urls": image_urls,
                        "usage_id": _text(draft.get("usage_id")),
                    }
                },
            },
        )
        return {
            "voucher_id": str(voucher.id),
            "voucher_number": voucher.voucher_number,
            "created_product_ids": created_products,
            "supplier_id": str(supplier.id) if supplier else None,
        }

    def _normalize_header(self, extracted: dict[str, Any]) -> dict[str, str]:
        return {
            "supplier_name": _text(extracted.get("supplier_name")),
            "gstin": _text(extracted.get("gstin")).upper(),
            "phone": _text(extracted.get("phone")),
            "invoice_number": _text(extracted.get("invoice_number")),
            "invoice_date": _text(extracted.get("invoice_date")),
            "place_of_supply": _text(extracted.get("place_of_supply")),
            "taxable": _money(extracted.get("taxable")),
            "cgst": _money(extracted.get("cgst")),
            "sgst": _money(extracted.get("sgst")),
            "igst": _money(extracted.get("igst")),
            "grand_total": _money(extracted.get("grand_total")),
        }

    def _match_supplier(self, *, tenant: Tenant, business: Business, header: dict[str, str]) -> dict[str, Any]:
        gstin = header.get("gstin") or ""
        name = header.get("supplier_name") or ""
        found: ShopSupplier | None = None
        match = ""
        if gstin:
            found = ShopSupplier.objects.filter(tenant=tenant, business=business, gstin__iexact=gstin).first()
            if found:
                match = "gstin"
        if found is None and name:
            exact = ShopSupplier.objects.filter(tenant=tenant, business=business, name__iexact=name)
            if exact.count() == 1:
                found = exact.first()
                match = "name"
            elif found is None:
                loose = ShopSupplier.objects.filter(tenant=tenant, business=business, name__icontains=name)
                if loose.count() == 1:
                    found = loose.first()
                    match = "name"
        return {
            "supplier_id": str(found.id) if found else "",
            "name": found.name if found else name,
            "gstin": found.gstin if found else gstin,
            "phone": found.phone if found else header.get("phone") or "",
            "match": match,
            "create": False,
        }

    def _match_line(self, *, tenant: Tenant, business: Business, raw: Any) -> dict[str, Any]:
        row = raw if isinstance(raw, dict) else {}
        name = _text(row.get("name"))
        barcode = _text(row.get("barcode") or row.get("code"))
        sku = _text(row.get("sku"))
        hsn_sac = _text(row.get("hsn_sac") or row.get("hsn"))
        product: ShopProduct | None = None
        match = ""
        if barcode:
            product = self.catalog.lookup_by_barcode(tenant=tenant, business=business, code=barcode)
            if product:
                match = "barcode"
        if product is None and sku:
            hits = ShopProduct.objects.filter(tenant=tenant, business=business, sku__iexact=sku)
            if hits.count() == 1:
                product = hits.first()
                match = "sku"
        if product is None and name:
            hits = ShopProduct.objects.filter(tenant=tenant, business=business, name__iexact=name)
            if hits.count() == 1:
                product = hits.first()
                match = "name"
            else:
                loose = ShopProduct.objects.filter(tenant=tenant, business=business, name__icontains=name)
                if loose.count() == 1:
                    product = loose.first()
                    match = "name"
        rate = _money(row.get("rate"))
        selling = _money(row.get("mrp")) or _money(row.get("price"))
        if not selling:
            selling = str(product.price) if product and product.price is not None else rate
        image_url = _text(row.get("image_url"))
        if not image_url and product:
            image_url = _text(getattr(product, "image_url", ""))
        tax_inclusive = _as_bool(row.get("tax_inclusive"))
        if tax_inclusive is None:
            tax_inclusive = _product_tax_inclusive(product)
        status = _text(row.get("status")) or (product.status if product else "active")
        currency = _text(row.get("currency")) or (product.currency if product and product.currency else "")
        stock = _money(row.get("stock_on_hand"))
        if not stock:
            stock = str(product.stock_on_hand) if product and product.stock_on_hand is not None else "0"
        return {
            "name": product.name if product else name,
            "barcode": barcode,
            "sku": product.sku if product and product.sku else sku,
            "hsn_sac": hsn_sac or (product.hsn_sac if product else ""),
            "qty": _qty(row.get("qty")),
            "rate": rate,
            "price": selling,
            "discount": _money(row.get("discount")) or "0",
            "gst_rate": _money(row.get("gst_rate")) or (str(product.gst_rate) if product else ""),
            "line_total": _money(row.get("line_total")),
            "product_id": str(product.id) if product else "",
            "brand": _text(row.get("brand")) or (product.brand if product else ""),
            "pack_size": _text(row.get("pack_size")) or (product.pack_size if product else ""),
            "status": status or "active",
            "category": _text(row.get("category")) or (product.category if product else ""),
            "currency": currency,
            "tax_inclusive": bool(tax_inclusive),
            "stock_on_hand": stock,
            "description": _text(row.get("description")) or (product.description if product else ""),
            "details_html": _text(row.get("details_html")) or (product.details_html if product else ""),
            "image_url": image_url,
            "image_source": "product" if product and image_url else "",
            "use_image": bool(image_url),
            "match": match,
            "create": not bool(product) and bool(name),
            "skip": False,
        }

    def _attach_catalog_previews(self, lines: list[dict[str, Any]]) -> None:
        pending = [
            row
            for row in lines
            if row.get("create") and _text(row.get("barcode")) and not _text(row.get("image_url"))
        ]
        cache: dict[str, dict[str, str]] = {}
        lookups = 0
        for row in pending:
            barcode = _text(row.get("barcode"))
            if barcode not in cache:
                if lookups >= _CATALOG_IMAGE_LOOKUP_CAP:
                    cache[barcode] = {}
                else:
                    cache[barcode] = self._lookup_catalog_preview(barcode)
                    lookups += 1
            extra = cache.get(barcode) or {}
            image_url = _text(extra.get("image_url"))
            if image_url:
                row["image_url"] = image_url
                row["image_source"] = extra.get("source") or "catalog"
                row["use_image"] = True
            _fill_if_empty(row, "brand", extra.get("brand"))
            _fill_if_empty(row, "pack_size", extra.get("pack_size"))
            _fill_if_empty(row, "description", extra.get("description"))
            _fill_if_empty(row, "details_html", extra.get("details_html"))
            _fill_if_empty(row, "category", extra.get("category") or extra.get("categories"))
            _fill_if_empty(row, "currency", extra.get("currency"))

    def _lookup_catalog_preview(self, barcode: str) -> dict[str, str]:
        try:
            result = self.catalog.enrich_barcode(code=barcode)
        except Exception as exc:
            logger.info("Invoice scan catalog preview failed for %s: %s", barcode, exc)
            return {}
        if not result.get("found"):
            return {}
        image_url = _text(result.get("image_url") or result.get("front_image_url"))
        category = _text(result.get("category")) or _text(result.get("categories")).split(",")[0]
        return {
            "image_url": image_url[:1024],
            "source": _text(result.get("source")) or "catalog",
            "brand": _text(result.get("brand"))[:120],
            "pack_size": _text(result.get("pack_size"))[:80],
            "description": _text(result.get("description"))[:2000],
            "details_html": _text(result.get("details_html"))[:10000],
            "category": category[:64],
            "currency": _text(result.get("currency"))[:3],
        }

    def _duplicate_warning(
        self,
        *,
        tenant: Tenant,
        business: Business,
        supplier_id: str,
        invoice_number: str,
    ) -> dict[str, Any]:
        number = invoice_number.strip()
        if not number:
            return {"found": False}
        qs = ShopBooksVoucher.objects.filter(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.PURCHASE,
        ).filter(
            Q(metadata__invoice_scan__invoice_number__iexact=number) | Q(notes__icontains=number)
        )
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        existing = qs.order_by("-created_at").first()
        if not existing:
            return {"found": False}
        return {
            "found": True,
            "voucher_id": str(existing.id),
            "voucher_number": existing.voucher_number,
            "message": f"Invoice {number} already posted as {existing.voucher_number}. You can still confirm if this is a new bill.",
        }

    def _resolve_confirm_supplier(
        self,
        *,
        tenant: Tenant,
        business: Business,
        payload: dict[str, Any],
        header: dict[str, Any],
        create_supplier: bool,
    ) -> ShopSupplier | None:
        supplier_id = _text(payload.get("supplier_id"))
        if supplier_id:
            try:
                return self.suppliers.get_supplier(
                    tenant=tenant,
                    business=business,
                    supplier_id=UUID(supplier_id),
                )
            except (ShopSupplier.DoesNotExist, ValueError):
                pass
        name = _text(payload.get("name") or header.get("supplier_name"))
        if not name:
            return None
        if create_supplier or payload.get("create"):
            return self.suppliers.create_supplier(
                tenant=tenant,
                business=business,
                data={
                    "name": name,
                    "gstin": _text(payload.get("gstin") or header.get("gstin")),
                    "phone": _text(payload.get("phone") or header.get("phone")),
                    "billing_state": _text(header.get("place_of_supply")),
                },
            )
        return None

    def _resolve_confirm_product(
        self,
        *,
        tenant: Tenant,
        business: Business,
        raw: dict[str, Any],
        create_missing: bool,
    ) -> ShopProduct | None:
        product_id = _text(raw.get("product_id"))
        if product_id:
            try:
                product = ShopProduct.objects.get(tenant=tenant, business=business, id=product_id)
            except (ShopProduct.DoesNotExist, ValueError):
                product = None
            if product is not None:
                selling = _money(raw.get("price")) or _money(raw.get("mrp"))
                if selling:
                    try:
                        next_price = Decimal(selling)
                    except (InvalidOperation, ValueError):
                        next_price = None
                    if next_price is not None and product.price != next_price:
                        product.price = next_price
                        product.save(update_fields=["price"])
                return product
        if not create_missing and not raw.get("create"):
            return None
        name = _text(raw.get("name"))
        if not name:
            return None
        rate = _money(raw.get("rate")) or "0"
        selling = _money(raw.get("price")) or _money(raw.get("mrp")) or rate
        gst = _money(raw.get("gst_rate")) or "0"
        barcode = _text(raw.get("barcode"))
        image_url = _text(raw.get("image_url")) if raw.get("use_image", True) else ""
        tax_inclusive = _as_bool(raw.get("tax_inclusive"))
        product = self.catalog.create_product(
            tenant=tenant,
            business=business,
            data={
                "name": name,
                "sku": _text(raw.get("sku")) or barcode,
                "brand": _text(raw.get("brand")),
                "pack_size": _text(raw.get("pack_size")),
                "description": _text(raw.get("description")),
                "details_html": _text(raw.get("details_html")),
                "hsn_sac": _text(raw.get("hsn_sac")),
                "price": selling,
                "purchase_price": rate,
                "gst_rate": gst,
                "tax_rate": gst,
                "status": _text(raw.get("status")) or "active",
                "category": _text(raw.get("category")),
                "currency": _text(raw.get("currency")) or business.currency or "INR",
                "image_url": image_url,
                "metadata": {"tax_inclusive": bool(tax_inclusive)},
            },
            barcodes=[{"code": barcode, "barcode_type": "manufacturer", "is_primary": True}] if barcode else None,
        )
        raw["created"] = True
        return product

    def _parse_invoice_date(self, value: Any) -> date | None:
        raw = _text(value)
        if not raw:
            return None
        parsed = parse_date(raw[:10])
        return parsed
