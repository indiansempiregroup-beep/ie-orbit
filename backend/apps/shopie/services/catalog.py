from __future__ import annotations

import logging
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce, ExtractWeekDay, TruncDate
from django.utils import timezone

from apps.businesses.models import Business
from apps.shopie.models import (
    BarcodeType,
    ProductStatus,
    ProfitChannel,
    ProfitFactKind,
    ShopProduct,
    ShopProductBarcode,
    ShopSaleProfitFact,
    ShopStockMovement,
    StockMovementType,
)
from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.shopie.services.html_sanitize import sanitize_product_html
from apps.shopie.services.profit_facts import money as fact_money
from apps.tenancy.models import Tenant


BULK_PRODUCT_LIMIT = 200
logger = logging.getLogger(__name__)


class CatalogService:
    enrichment = ProductEnrichmentService()
    bulk_limit = BULK_PRODUCT_LIMIT

    def list_products(
        self,
        *,
        tenant: Tenant,
        business: Business,
        search: str | None = None,
        status: str | None = None,
        category: str | None = None,
        brand: str | None = None,
    ) -> QuerySet[ShopProduct]:
        qs = (
            ShopProduct.objects.filter(tenant=tenant, business=business)
            .prefetch_related("barcodes")
            .annotate(
                rating_avg=Avg("reviews__rating", filter=Q(reviews__deleted_at__isnull=True, reviews__is_active=True)),
                rating_count=Count(
                    "reviews",
                    filter=Q(reviews__deleted_at__isnull=True, reviews__is_active=True),
                    distinct=True,
                ),
            )
            .order_by("name")
        )
        if status:
            qs = qs.filter(status=status)
        if category:
            qs = qs.filter(category=category)
        if brand:
            qs = self._apply_brand_filter(qs, tenant=tenant, business=business, brand=brand)
        if search:
            term = search.strip()
            qs = qs.filter(
                Q(name__icontains=term)
                | Q(brand__icontains=term)
                | Q(sku__icontains=term)
                | Q(category__icontains=term)
                | Q(barcodes__code__icontains=term)
            ).distinct()
        return qs

    def get_product(self, *, tenant: Tenant, business: Business, product_id: UUID) -> ShopProduct:
        return (
            ShopProduct.objects.filter(tenant=tenant, business=business, id=product_id)
            .prefetch_related("barcodes")
            .annotate(
                rating_avg=Avg("reviews__rating", filter=Q(reviews__deleted_at__isnull=True, reviews__is_active=True)),
                rating_count=Count(
                    "reviews",
                    filter=Q(reviews__deleted_at__isnull=True, reviews__is_active=True),
                    distinct=True,
                ),
            )
            .get()
        )

    def lookup_by_barcode(
        self, *, tenant: Tenant, business: Business, code: str
    ) -> ShopProduct | None:
        normalized = (code or "").strip()
        if not normalized:
            return None
        barcode = (
            ShopProductBarcode.objects.select_related("product")
            .filter(tenant=tenant, business=business, code=normalized)
            .first()
        )
        return barcode.product if barcode else None

    def lookup_many(
        self, *, tenant: Tenant, business: Business, codes: list[str]
    ) -> list[dict[str, Any]]:
        """Resolve many codes (barcode or RFID EPC) for bulk/basket fill."""
        results: list[dict[str, Any]] = []
        for raw in codes:
            code = (raw or "").strip()
            if not code:
                continue
            product = self.lookup_by_barcode(tenant=tenant, business=business, code=code)
            if product is None:
                results.append({"code": code, "found": False, "product": None})
            else:
                product = self.get_product(tenant=tenant, business=business, product_id=product.id)
                results.append(
                    {
                        "code": code,
                        "found": True,
                        "product_id": str(product.id),
                        "product": product,
                    }
                )
        return results

    def enrich_barcode(self, *, code: str = "", query: str = "") -> dict[str, Any]:
        return self.enrichment.enrich(code=code, query=query)

    def enrich_from_image(self, *, image_url: str = "", hint: str = "") -> dict[str, Any]:
        return self.enrichment.enrich_from_image_hint(image_url=image_url, hint=hint)

    @transaction.atomic
    def create_product(
        self,
        *,
        tenant: Tenant,
        business: Business,
        data: dict[str, Any],
        barcodes: list[dict[str, Any]] | None = None,
    ) -> ShopProduct:
        product = ShopProduct.objects.create(
            tenant=tenant,
            business=business,
            sku=str(data.get("sku") or "").strip(),
            name=str(data["name"]).strip(),
            brand=str(data.get("brand") or "").strip(),
            description=str(data.get("description") or "").strip(),
            details_html=sanitize_product_html(data.get("details_html")),
            status=str(data.get("status") or ProductStatus.ACTIVE),
            price=Decimal(str(data.get("price") or "0")),
            purchase_price=Decimal(str(data.get("purchase_price") or "0")),
            avg_cost=Decimal(str(data.get("purchase_price") or "0")),
            tax_rate=Decimal(str(data.get("tax_rate") or "0")),
            hsn_sac=str(data.get("hsn_sac") or "").strip(),
            gst_rate=Decimal(str(data.get("gst_rate") if data.get("gst_rate") is not None else data.get("tax_rate") or "0")),
            batch_tracking_enabled=bool(data.get("batch_tracking_enabled") or False),
            currency=str(data.get("currency") or business.currency or "INR"),
            stock_on_hand=Decimal("0"),
            low_stock_threshold=Decimal(str(data.get("low_stock_threshold") or "0")),
            pack_size=str(data.get("pack_size") or "").strip(),
            unit=str(data.get("unit") or "").strip(),
            image_url=str(data.get("image_url") or "").strip(),
            category=self._normalize_category(data.get("category")),
            metadata=data.get("metadata") or {},
        )
        product = self._sync_primary_image(product)
        for row in barcodes or []:
            self._attach_barcode(tenant=tenant, business=business, product=product, row=row)
        initial_stock = Decimal(str(data.get("stock_on_hand") or "0"))
        if initial_stock != 0:
            product = self.adjust_stock(
                tenant=tenant,
                business=business,
                product=product,
                quantity_delta=initial_stock,
                movement_type=StockMovementType.RECEIVE,
                reason="Initial stock",
                godown_id=data.get("godown_id"),
                unit_cost=product.purchase_price,
            )
        product = self.get_product(tenant=tenant, business=business, product_id=product.id)
        self._sync_master_lookups(tenant=tenant, business=business, product=product)
        self._contribute_gtin(product)
        return product

    @transaction.atomic
    def update_product(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product: ShopProduct,
        data: dict[str, Any],
        barcodes: list[dict[str, Any]] | None = None,
    ) -> ShopProduct:
        for field in (
            "sku",
            "name",
            "brand",
            "description",
            "details_html",
            "status",
            "pack_size",
            "unit",
            "image_url",
            "hsn_sac",
        ):
            if field in data and data[field] is not None:
                value = str(data[field]).strip() if isinstance(data[field], str) else data[field]
                if field == "details_html":
                    value = sanitize_product_html(str(value) if value is not None else "")
                setattr(product, field, value)
        purchase_price_updated = False
        for field in ("price", "purchase_price", "tax_rate", "gst_rate", "low_stock_threshold"):
            if field in data and data[field] is not None:
                setattr(product, field, Decimal(str(data[field])))
                if field == "purchase_price":
                    purchase_price_updated = True
        if "batch_tracking_enabled" in data and data["batch_tracking_enabled"] is not None:
            product.batch_tracking_enabled = bool(data["batch_tracking_enabled"])
        if "currency" in data and data["currency"]:
            product.currency = str(data["currency"]).strip()
        if "category" in data:
            product.category = self._normalize_category(data.get("category"))
        if "stock_on_hand" in data and data["stock_on_hand"] is not None:
            target = Decimal(str(data["stock_on_hand"]))
            if target != product.stock_on_hand:
                delta = target - product.stock_on_hand
                movement = (
                    StockMovementType.RECEIVE if delta > 0 else StockMovementType.ADJUST
                )
                unit_cost = (
                    product.purchase_price
                    if delta > 0 and (purchase_price_updated or product.purchase_price)
                    else None
                )
                product = self.adjust_stock(
                    tenant=tenant,
                    business=business,
                    product=product,
                    quantity_delta=delta,
                    movement_type=movement,
                    reason="Manual stock edit",
                    godown_id=data.get("godown_id"),
                    unit_cost=unit_cost,
                )
        elif purchase_price_updated and product.stock_on_hand <= 0:
            # No on-hand mix — keep avg cost aligned with last buy.
            product.avg_cost = Decimal(str(product.purchase_price or 0))
        if "metadata" in data and data["metadata"] is not None:
            incoming = data["metadata"] if isinstance(data["metadata"], dict) else {}
            current = product.metadata if isinstance(product.metadata, dict) else {}
            merged = {**current, **incoming}
            current_images = current.get("images") if isinstance(current.get("images"), dict) else {}
            incoming_images = incoming.get("images") if isinstance(incoming.get("images"), dict) else {}
            if current_images or incoming_images:
                merged["images"] = {**current_images, **incoming_images}
            product.metadata = merged
        product = self._sync_primary_image(product)
        product.save()

        if barcodes is not None:
            product.barcodes.all().delete()
            for row in barcodes:
                self._attach_barcode(tenant=tenant, business=business, product=product, row=row)
        product = self.get_product(tenant=tenant, business=business, product_id=product.id)
        self._sync_master_lookups(tenant=tenant, business=business, product=product)
        self._contribute_gtin(product)
        return product

    def _sync_master_lookups(self, *, tenant: Tenant, business: Business, product: ShopProduct) -> None:
        from apps.shopie.models import ShopMasterKind
        from apps.shopie.services.masters import MasterService

        masters = MasterService()
        if product.category:
            masters.ensure(
                tenant=tenant,
                business=business,
                kind=ShopMasterKind.CATEGORY,
                slug=product.category,
                label=product.category,
            )
        if product.brand:
            masters.ensure(
                tenant=tenant,
                business=business,
                kind=ShopMasterKind.BRAND,
                label=product.brand,
            )
        if product.unit:
            masters.ensure(
                tenant=tenant,
                business=business,
                kind=ShopMasterKind.UNIT,
                label=product.unit,
                slug=product.unit,
            )

    @staticmethod
    def _apply_brand_filter(
        qs: QuerySet[ShopProduct],
        *,
        tenant: Tenant,
        business: Business,
        brand: str,
    ) -> QuerySet[ShopProduct]:
        from apps.shopie.models import ShopMasterKind, ShopMasterRecord

        term = (brand or "").strip()
        if not term:
            return qs
        master = (
            ShopMasterRecord.objects.filter(
                tenant=tenant,
                business=business,
                kind=ShopMasterKind.BRAND,
                deleted_at__isnull=True,
                is_active=True,
            )
            .filter(Q(slug__iexact=term) | Q(label__iexact=term))
            .first()
        )
        if not master:
            return qs.filter(brand__iexact=term)
        aliases = {
            master.label.strip(),
            master.slug.strip(),
            master.slug.replace("_", " ").strip(),
            term,
        }
        brand_q = Q()
        for alias in aliases:
            if alias:
                brand_q |= Q(brand__iexact=alias)
        return qs.filter(brand_q) if brand_q else qs.filter(brand__iexact=term)

    def _contribute_gtin(self, product: ShopProduct) -> None:
        try:
            self.enrichment.contribute_from_shop_product(product)
        except Exception:  # noqa: BLE001 — never fail shop save because of catalog share
            logger.exception("Failed to contribute shop product %s to platform GTIN catalog", product.id)

    @staticmethod
    def apply_receive_wac(
        product: ShopProduct,
        *,
        qty_before: Decimal,
        receive_qty: Decimal,
        unit_cost: Decimal,
    ) -> None:
        """Blend weighted average cost when stock is received with a known unit cost."""
        receive_qty = Decimal(str(receive_qty or "0"))
        unit_cost = fact_money(unit_cost)
        if receive_qty <= 0:
            return
        qty_before = Decimal(str(qty_before or "0"))
        old_avg = fact_money(product.avg_cost or product.purchase_price or 0)
        if qty_before <= 0:
            new_avg = unit_cost
        else:
            new_avg = fact_money(
                ((old_avg * qty_before) + (unit_cost * receive_qty)) / (qty_before + receive_qty)
            )
        product.avg_cost = new_avg
        product.purchase_price = unit_cost

    @transaction.atomic
    def adjust_stock(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product: ShopProduct,
        quantity_delta: Decimal,
        movement_type: str = StockMovementType.ADJUST,
        reason: str = "",
        order=None,
        godown_id=None,
        allow_backorder: bool = False,
        unit_cost: Decimal | None = None,
    ) -> ShopProduct:
        quantity_delta = Decimal(str(quantity_delta or "0"))
        qty_before = Decimal(str(product.stock_on_hand or 0))
        new_qty = qty_before + quantity_delta
        if new_qty < 0:
            raise ValidationError({"stock_on_hand": "Insufficient stock."})
        update_fields = ["stock_on_hand", "updated_at", "version"]
        if unit_cost is not None and quantity_delta > 0:
            self.apply_receive_wac(
                product,
                qty_before=qty_before,
                receive_qty=quantity_delta,
                unit_cost=unit_cost,
            )
            update_fields.extend(["avg_cost", "purchase_price"])
        product.stock_on_hand = new_qty
        product.save(update_fields=update_fields)
        from apps.shopie.services.godowns import GodownsService

        stock_row = GodownsService().apply_catalog_delta(
            tenant=tenant,
            business=business,
            product=product,
            delta=quantity_delta,
            godown_id=godown_id,
            quantity_after=new_qty,
            allow_backorder=allow_backorder,
        )
        metadata: dict[str, Any] = {}
        if godown_id:
            metadata["godown_id"] = str(godown_id)
        elif stock_row is not None:
            metadata["godown_id"] = str(stock_row.godown_id)
        if unit_cost is not None and quantity_delta > 0:
            metadata["unit_cost"] = str(fact_money(unit_cost))
        ShopStockMovement.objects.create(
            tenant=tenant,
            business=business,
            product=product,
            movement_type=movement_type,
            quantity_delta=quantity_delta,
            quantity_after=new_qty,
            reason=reason,
            order=order,
            metadata=metadata,
        )
        return product

    @staticmethod
    def _sync_primary_image(product: ShopProduct) -> ShopProduct:
        """Keep image_url aligned with the first gallery photo (product card primary)."""
        metadata = product.metadata if isinstance(product.metadata, dict) else {}
        images = metadata.get("images") if isinstance(metadata.get("images"), dict) else {}
        gallery = images.get("gallery") if isinstance(images.get("gallery"), list) else []
        primary = ""
        for item in gallery:
            value = str(item or "").strip()
            if value:
                primary = value
                break
        if not primary:
            primary = str(images.get("front") or product.image_url or "").strip()
        if primary:
            product.image_url = primary
            images = {**images, "front": images.get("front") or primary, "gallery": gallery or [primary]}
            if primary not in (gallery or []):
                images["gallery"] = [primary, *[str(x) for x in gallery if str(x or "").strip() and str(x) != primary]][
                    :5
                ]
            product.metadata = {**metadata, "images": images}
            product.save(update_fields=["image_url", "metadata", "updated_at", "version"])
        return product

    @staticmethod
    def _normalize_category(value: Any) -> str:
        from apps.shopie.services.categories import CategoryService

        raw = str(value or "").strip()
        if not raw:
            return ""
        row = CategoryService().ensure_category(label=raw, slug=raw)
        return row.slug if row else ""

    def _attach_barcode(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product: ShopProduct,
        row: dict[str, Any],
    ) -> ShopProductBarcode:
        code = str(row.get("code") or "").strip()
        if not code:
            raise ValidationError({"barcodes": "Barcode code is required."})
        if ShopProductBarcode.objects.filter(business=business, code=code).exclude(product=product).exists():
            raise ValidationError({"barcodes": f"Barcode {code} is already assigned to another product."})
        barcode_type = str(row.get("barcode_type") or BarcodeType.MANUFACTURER)
        if barcode_type not in BarcodeType.values:
            barcode_type = BarcodeType.MANUFACTURER
        return ShopProductBarcode.objects.create(
            tenant=tenant,
            business=business,
            product=product,
            code=code,
            barcode_type=barcode_type,
            is_primary=bool(row.get("is_primary")),
        )

    def create_products_bulk(
        self,
        *,
        tenant: Tenant,
        business: Business,
        items: list[dict[str, Any]],
        godown_id: UUID | None = None,
    ) -> tuple[list[ShopProduct], list[dict[str, Any]]]:
        created: list[ShopProduct] = []
        errors: list[dict[str, Any]] = []
        for index, raw in enumerate(items):
            row = dict(raw)
            barcodes = row.pop("barcodes", None)
            row.pop("business_id", None)
            if godown_id and not row.get("godown_id"):
                row["godown_id"] = godown_id
            try:
                created.append(
                    self.create_product(
                        tenant=tenant,
                        business=business,
                        data=row,
                        barcodes=barcodes,
                    )
                )
            except (ValidationError, IntegrityError) as exc:
                errors.append(_bulk_row_error(index, exc))
        return created, errors

    def update_products_bulk(
        self,
        *,
        tenant: Tenant,
        business: Business,
        ids: list[UUID],
        updates: dict[str, Any],
    ) -> tuple[list[ShopProduct], list[dict[str, Any]]]:
        updated: list[ShopProduct] = []
        errors: list[dict[str, Any]] = []
        price_update = updates.get("price") if isinstance(updates.get("price"), dict) else None
        base = {
            key: value
            for key, value in updates.items()
            if key != "price" and value is not None
        }
        if "gst_rate" in base and "tax_rate" not in base:
            base["tax_rate"] = base["gst_rate"]
        for index, product_id in enumerate(ids):
            product = (
                ShopProduct.objects.filter(tenant=tenant, business=business, id=product_id)
                .prefetch_related("barcodes")
                .first()
            )
            if not product:
                errors.append({"index": index, "code": "not_found", "message": "Product not found."})
                continue
            data = dict(base)
            if price_update:
                if price_update.get("set") is not None:
                    data["price"] = price_update["set"]
                elif price_update.get("percent") is not None:
                    factor = Decimal("1") + (Decimal(str(price_update["percent"])) / Decimal("100"))
                    data["price"] = (product.price * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if not data:
                errors.append({"index": index, "code": "invalid", "message": "No updates were provided."})
                continue
            try:
                updated.append(
                    self.update_product(
                        tenant=tenant,
                        business=business,
                        product=product,
                        data=data,
                    )
                )
            except (ValidationError, IntegrityError) as exc:
                errors.append(_bulk_row_error(index, exc))
        return updated, errors

    def product_profit_insights(
        self,
        *,
        tenant: Tenant,
        business: Business,
        date_from: str | None = None,
        date_to: str | None = None,
        channel: str | None = None,
        q: str | None = None,
        category: str | None = None,
        sort: str | None = None,
        order: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
        include_catalog: bool = True,
    ) -> dict[str, Any]:
        from django.utils.dateparse import parse_date

        def money(value: Decimal) -> Decimal:
            return value.quantize(Decimal("0.01"))

        today = timezone.localdate()
        if not date_from and not date_to:
            date_to = today.isoformat()
            date_from = (today - timedelta(days=29)).isoformat()

        parsed_from = parse_date(date_from) if date_from else None
        parsed_to = parse_date(date_to) if date_to else None

        zero_money = Value(Decimal("0.00"))
        zero_qty = Value(Decimal("0"))
        facts = ShopSaleProfitFact.objects.require_tenant(tenant).filter(business=business)
        if parsed_from:
            facts = facts.filter(sold_at__date__gte=parsed_from)
        if parsed_to:
            facts = facts.filter(sold_at__date__lte=parsed_to)

        channel_key = str(channel or "all").strip().lower()
        if channel_key in {
            ProfitChannel.POS,
            ProfitChannel.ONLINE_PICKUP,
            ProfitChannel.ONLINE_DELIVERY,
        }:
            facts = facts.filter(channel=channel_key)

        search = str(q or "").strip()
        if search:
            facts = facts.filter(Q(product_name__icontains=search) | Q(sku__icontains=search))

        category_slug = self._normalize_category(category) if category else ""
        if category_slug:
            facts = facts.filter(product__category=category_slug)

        totals = facts.aggregate(
            revenue=Coalesce(Sum("net_revenue"), zero_money),
            amount_paid=Coalesce(Sum("amount_paid"), zero_money),
            tax_collected=Coalesce(Sum("tax_collected"), zero_money),
            cogs=Coalesce(Sum("cogs"), zero_money),
            profit=Coalesce(Sum("gross_profit"), zero_money),
            units=Coalesce(Sum("quantity"), zero_qty),
            orders=Count("order_id", distinct=True),
            fact_rows=Count("id"),
        )
        discount_agg = facts.aggregate(
            line_disc=Coalesce(Sum("line_discount_amount"), zero_money),
            bill_disc=Coalesce(Sum("bill_discount_share"), zero_money),
        )
        sale_only = facts.filter(fact_kind=ProfitFactKind.SALE).aggregate(
            sale_units=Coalesce(Sum("quantity"), zero_qty),
            sale_profit=Coalesce(Sum("gross_profit"), zero_money),
            sale_revenue=Coalesce(Sum("net_revenue"), zero_money),
            sale_cogs=Coalesce(Sum("cogs"), zero_money),
        )
        # Shelf revenue (price-field basis) — used for margin vs profit.
        total_revenue = money(Decimal(str(totals.get("revenue") or 0)))
        # What customers actually paid (line totals, includes exclusive GST).
        total_amount_paid = money(Decimal(str(totals.get("amount_paid") or 0)))
        gst_collected = money(Decimal(str(totals.get("tax_collected") or 0)))
        # Purchase ITC not tracked on product cost yet — remit ≈ output GST.
        gst_to_remit = gst_collected
        total_cogs = money(Decimal(str(totals.get("cogs") or 0)))
        total_profit = money(Decimal(str(totals.get("profit") or 0)))
        total_units = Decimal(str(totals.get("units") or 0)).quantize(Decimal("0.001"))
        discounts_total = money(
            Decimal(str(discount_agg.get("line_disc") or 0))
            + Decimal(str(discount_agg.get("bill_disc") or 0))
        )
        margin_pct = (
            (total_profit / total_revenue * Decimal("100")).quantize(Decimal("0.01"))
            if total_revenue > 0
            else Decimal("0.00")
        )

        returns_agg = facts.filter(fact_kind=ProfitFactKind.RETURN).aggregate(
            revenue=Coalesce(Sum("net_revenue"), zero_money),
            cogs=Coalesce(Sum("cogs"), zero_money),
            profit=Coalesce(Sum("gross_profit"), zero_money),
        )
        cancels_agg = facts.filter(fact_kind=ProfitFactKind.CANCEL).aggregate(
            profit=Coalesce(Sum("gross_profit"), zero_money),
        )

        by_channel_rows: list[dict[str, Any]] = []
        channel_qs = (
            facts.values("channel")
            .annotate(
                revenue=Coalesce(Sum("net_revenue"), zero_money),
                cogs=Coalesce(Sum("cogs"), zero_money),
                profit=Coalesce(Sum("gross_profit"), zero_money),
                units=Coalesce(Sum("quantity"), zero_qty),
            )
            .order_by("channel")
        )
        for row in channel_qs:
            rev = money(Decimal(str(row["revenue"] or 0)))
            profit = money(Decimal(str(row["profit"] or 0)))
            by_channel_rows.append(
                {
                    "channel": row["channel"],
                    "revenue": str(rev),
                    "cogs": str(money(Decimal(str(row["cogs"] or 0)))),
                    "gross_profit": str(profit),
                    "units": str(Decimal(str(row["units"] or 0)).quantize(Decimal("0.001"))),
                    "margin_percent": str(
                        (profit / rev * Decimal("100")).quantize(Decimal("0.01"))
                        if rev > 0
                        else Decimal("0.00")
                    ),
                }
            )

        series_rows: list[dict[str, Any]] = []
        for row in (
            facts.annotate(day=TruncDate("sold_at"))
            .values("day")
            .annotate(
                revenue=Coalesce(Sum("amount_paid"), zero_money),
                shelf_revenue=Coalesce(Sum("net_revenue"), zero_money),
                cogs=Coalesce(Sum("cogs"), zero_money),
                profit=Coalesce(Sum("gross_profit"), zero_money),
                units=Coalesce(Sum("quantity"), zero_qty),
            )
            .order_by("day")
        ):
            series_rows.append(
                {
                    "date": row["day"].isoformat() if row["day"] else "",
                    "revenue": str(money(Decimal(str(row["revenue"] or 0)))),
                    "shelf_revenue": str(money(Decimal(str(row["shelf_revenue"] or 0)))),
                    "cogs": str(money(Decimal(str(row["cogs"] or 0)))),
                    "gross_profit": str(money(Decimal(str(row["profit"] or 0)))),
                    "units": str(Decimal(str(row["units"] or 0)).quantize(Decimal("0.001"))),
                }
            )

        product_agg = list(
            facts.values("product_id", "product_name", "sku")
            .annotate(
                units=Coalesce(Sum("quantity"), zero_qty),
                revenue=Coalesce(Sum("net_revenue"), zero_money),
                cogs=Coalesce(Sum("cogs"), zero_money),
                profit=Coalesce(Sum("gross_profit"), zero_money),
                discounts=Coalesce(Sum("line_discount_amount"), zero_money),
                bill_discounts=Coalesce(Sum("bill_discount_share"), zero_money),
            )
        )
        sales_built: list[dict[str, Any]] = []
        for row in product_agg:
            rev = money(Decimal(str(row["revenue"] or 0)))
            cogs = money(Decimal(str(row["cogs"] or 0)))
            profit = money(Decimal(str(row["profit"] or 0)))
            units = Decimal(str(row["units"] or 0)).quantize(Decimal("0.001"))
            disc = money(
                Decimal(str(row["discounts"] or 0)) + Decimal(str(row["bill_discounts"] or 0))
            )
            avg_unit_cost = money(cogs / units) if units > 0 else Decimal("0.00")
            sales_built.append(
                {
                    "product_id": str(row["product_id"]),
                    "name": row["product_name"] or "",
                    "sku": row["sku"] or "",
                    "units_sold": str(units),
                    "revenue": str(rev),
                    "discounts": str(disc),
                    "cogs": str(cogs),
                    "gross_profit": str(profit),
                    "margin_percent": str(
                        (profit / rev * Decimal("100")).quantize(Decimal("0.01"))
                        if rev > 0
                        else Decimal("0.00")
                    ),
                    "avg_unit_cost": str(avg_unit_cost),
                    "_sort_profit": profit,
                    "_sort_margin": (profit / rev) if rev > 0 else Decimal("0"),
                    "_sort_revenue": rev,
                    "_sort_units": units,
                    "_sort_name": (row["product_name"] or "").lower(),
                }
            )

        sort_key = str(sort or "gross_profit").strip().lower()
        sort_map = {
            "gross_profit": "_sort_profit",
            "margin_percent": "_sort_margin",
            "revenue": "_sort_revenue",
            "units": "_sort_units",
            "name": "_sort_name",
        }
        sort_field = sort_map.get(sort_key, "_sort_profit")
        reverse = str(order or "desc").strip().lower() != "asc"
        if sort_field == "_sort_name":
            reverse = str(order or "asc").strip().lower() == "desc"
        sales_built.sort(key=lambda item: item[sort_field], reverse=reverse)

        try:
            limit_n = max(1, min(int(limit if limit is not None else 50), 200))
        except (TypeError, ValueError):
            limit_n = 50
        try:
            offset_n = max(0, int(offset or 0))
        except (TypeError, ValueError):
            offset_n = 0
        sales_total = len(sales_built)
        sales_page = sales_built[offset_n : offset_n + limit_n]
        # Insight cards use profit ranking (independent of table sort).
        by_profit_desc = sorted(sales_built, key=lambda item: item["_sort_profit"], reverse=True)
        top_profit_products = [
            {
                "product_id": row["product_id"],
                "name": row["name"],
                "sku": row["sku"],
                "units_sold": row["units_sold"],
                "revenue": row["revenue"],
                "cogs": row["cogs"],
                "gross_profit": row["gross_profit"],
                "margin_percent": row["margin_percent"],
                "discounts": row["discounts"],
            }
            for row in by_profit_desc[:10]
        ]
        all_loss_makers = [
            {
                "product_id": row["product_id"],
                "name": row["name"],
                "sku": row["sku"],
                "units_sold": row["units_sold"],
                "revenue": row["revenue"],
                "cogs": row["cogs"],
                "gross_profit": row["gross_profit"],
                "margin_percent": row["margin_percent"],
                "discounts": row["discounts"],
            }
            for row in sorted(sales_built, key=lambda item: item["_sort_profit"])
            if row["_sort_profit"] < 0
        ]
        loss_maker_count = len(all_loss_makers)
        loss_makers = all_loss_makers[:10]
        for row in sales_page:
            for key in list(row.keys()):
                if key.startswith("_sort_"):
                    del row[key]

        # Category breakdown from product FK.
        from apps.shopie.services.categories import CategoryService

        category_labels = CategoryService()
        by_category_rows: list[dict[str, Any]] = []
        for row in (
            facts.values("product__category")
            .annotate(
                revenue=Coalesce(Sum("net_revenue"), zero_money),
                cogs=Coalesce(Sum("cogs"), zero_money),
                profit=Coalesce(Sum("gross_profit"), zero_money),
                units=Coalesce(Sum("quantity"), zero_qty),
            )
            .order_by("-profit")
        ):
            rev = money(Decimal(str(row["revenue"] or 0)))
            profit = money(Decimal(str(row["profit"] or 0)))
            slug = str(row["product__category"] or "").strip() or "uncategorized"
            by_category_rows.append(
                {
                    "category": slug,
                    "category_label": (
                        "Uncategorized"
                        if slug == "uncategorized"
                        else category_labels.label_for(slug)
                    ),
                    "revenue": str(rev),
                    "cogs": str(money(Decimal(str(row["cogs"] or 0)))),
                    "gross_profit": str(profit),
                    "units": str(Decimal(str(row["units"] or 0)).quantize(Decimal("0.001"))),
                    "margin_percent": str(
                        (profit / rev * Decimal("100")).quantize(Decimal("0.01"))
                        if rev > 0
                        else Decimal("0.00")
                    ),
                }
            )

        # Django ExtractWeekDay: Sunday=1 … Saturday=7
        weekday_labels = {
            1: "Sun",
            2: "Mon",
            3: "Tue",
            4: "Wed",
            5: "Thu",
            6: "Fri",
            7: "Sat",
        }
        by_weekday_rows: list[dict[str, Any]] = []
        for row in (
            facts.annotate(weekday=ExtractWeekDay("sold_at"))
            .values("weekday")
            .annotate(
                revenue=Coalesce(Sum("net_revenue"), zero_money),
                profit=Coalesce(Sum("gross_profit"), zero_money),
                units=Coalesce(Sum("quantity"), zero_qty),
            )
            .order_by("weekday")
        ):
            wd = int(row["weekday"] or 0)
            rev = money(Decimal(str(row["revenue"] or 0)))
            profit = money(Decimal(str(row["profit"] or 0)))
            by_weekday_rows.append(
                {
                    "weekday": wd,
                    "label": weekday_labels.get(wd, str(wd)),
                    "revenue": str(rev),
                    "gross_profit": str(profit),
                    "units": str(Decimal(str(row["units"] or 0)).quantize(Decimal("0.001"))),
                    "margin_percent": str(
                        (profit / rev * Decimal("100")).quantize(Decimal("0.01"))
                        if rev > 0
                        else Decimal("0.00")
                    ),
                }
            )

        # Previous equal-length period comparison.
        comparison: dict[str, Any] = {}
        if parsed_from and parsed_to and parsed_to >= parsed_from:
            period_days = (parsed_to - parsed_from).days + 1
            prev_to = parsed_from - timedelta(days=1)
            prev_from = prev_to - timedelta(days=period_days - 1)
            prev_facts = ShopSaleProfitFact.objects.require_tenant(tenant).filter(
                business=business,
                sold_at__date__gte=prev_from,
                sold_at__date__lte=prev_to,
            )
            if channel_key in {
                ProfitChannel.POS,
                ProfitChannel.ONLINE_PICKUP,
                ProfitChannel.ONLINE_DELIVERY,
            }:
                prev_facts = prev_facts.filter(channel=channel_key)
            if search:
                prev_facts = prev_facts.filter(
                    Q(product_name__icontains=search) | Q(sku__icontains=search)
                )
            if category_slug:
                prev_facts = prev_facts.filter(product__category=category_slug)
            prev_totals = prev_facts.aggregate(
                revenue=Coalesce(Sum("amount_paid"), zero_money),
                profit=Coalesce(Sum("gross_profit"), zero_money),
                units=Coalesce(Sum("quantity"), zero_qty),
            )
            prev_revenue = money(Decimal(str(prev_totals.get("revenue") or 0)))
            prev_profit = money(Decimal(str(prev_totals.get("profit") or 0)))
            prev_units = Decimal(str(prev_totals.get("units") or 0)).quantize(Decimal("0.001"))

            def _delta_pct(current: Decimal, previous: Decimal) -> str:
                if previous == 0:
                    return "" if current == 0 else "100.00"
                return str(
                    ((current - previous) / abs(previous) * Decimal("100")).quantize(
                        Decimal("0.01")
                    )
                )

            comparison = {
                "previous_from": prev_from.isoformat(),
                "previous_to": prev_to.isoformat(),
                "sales_revenue": str(prev_revenue),
                "gross_profit": str(prev_profit),
                "units_sold": str(prev_units),
                "revenue_delta_percent": _delta_pct(total_amount_paid, prev_revenue),
                "profit_delta_percent": _delta_pct(total_profit, prev_profit),
                "units_delta_percent": _delta_pct(total_units, prev_units),
            }

        catalog_rows: list[dict[str, Any]] = []
        inventory_at_cost = Decimal("0.00")
        potential_profit = Decimal("0.00")
        top_margins: list[dict[str, Any]] = []
        low_margins: list[dict[str, Any]] = []
        missing_cost_count = 0
        stock_risk: list[dict[str, Any]] = []
        if include_catalog:
            products_qs = ShopProduct.objects.require_tenant(tenant).filter(business=business)
            if search:
                products_qs = products_qs.filter(Q(name__icontains=search) | Q(sku__icontains=search))
            if category_slug:
                products_qs = products_qs.filter(category=category_slug)
            products = list(products_qs.order_by("name"))
            for product in products:
                sell = Decimal(str(product.price or 0))
                last_buy = Decimal(str(product.purchase_price or 0))
                avg_cost = Decimal(
                    str(
                        product.avg_cost
                        if product.avg_cost is not None
                        else last_buy
                    )
                    or 0
                )
                if avg_cost <= 0:
                    avg_cost = last_buy
                stock = Decimal(str(product.stock_on_hand or 0))
                margin = sell - avg_cost
                margin_pct = (
                    (margin / sell * Decimal("100")).quantize(Decimal("0.01"))
                    if sell > 0
                    else Decimal("0.00")
                )
                row_inventory = money(stock * avg_cost)
                row_potential = money(stock * margin) if margin > 0 else Decimal("0.00")
                inventory_at_cost += row_inventory
                potential_profit += row_potential
                if avg_cost <= 0 and last_buy <= 0:
                    missing_cost_count += 1
                catalog_rows.append(
                    {
                        "product_id": str(product.id),
                        "name": product.name,
                        "sku": product.sku,
                        "category": product.category or "",
                        "price": str(money(sell)),
                        "purchase_price": str(money(last_buy)),
                        "avg_cost": str(money(avg_cost)),
                        "margin": str(money(margin)),
                        "margin_percent": str(margin_pct),
                        "stock_on_hand": str(stock),
                        "inventory_at_cost": str(row_inventory),
                        "potential_profit": str(row_potential),
                        "currency": product.currency or business.currency or "INR",
                    }
                )
            priced = [row for row in catalog_rows if Decimal(row["avg_cost"]) > 0]
            top_margins = sorted(
                priced, key=lambda row: Decimal(row["margin_percent"]), reverse=True
            )[:10]
            low_margins = sorted(priced, key=lambda row: Decimal(row["margin_percent"]))[:10]
            stock_risk = sorted(
                [
                    row
                    for row in priced
                    if Decimal(row["stock_on_hand"]) > 0
                    and Decimal(row["margin_percent"]) < Decimal("10")
                ],
                key=lambda row: Decimal(row["inventory_at_cost"]),
                reverse=True,
            )[:10]

        line_disc_total = money(Decimal(str(discount_agg.get("line_disc") or 0)))
        bill_disc_total = money(Decimal(str(discount_agg.get("bill_disc") or 0)))
        returns_profit_abs = money(abs(Decimal(str(returns_agg.get("profit") or 0))))
        cancels_profit_abs = money(abs(Decimal(str(cancels_agg.get("profit") or 0))))
        # Completed bills only — exclude orders that were cancelled in this window.
        cancelled_order_ids = facts.filter(fact_kind=ProfitFactKind.CANCEL).values_list(
            "order_id", flat=True
        )
        order_count = (
            facts.filter(fact_kind=ProfitFactKind.SALE)
            .exclude(order_id__in=cancelled_order_ids)
            .values("order_id")
            .distinct()
            .count()
        )
        sale_profit_gross = money(Decimal(str(sale_only.get("sale_profit") or 0)))
        sale_revenue_gross = money(Decimal(str(sale_only.get("sale_revenue") or 0)))
        sale_cogs_gross = money(Decimal(str(sale_only.get("sale_cogs") or 0)))
        sale_units_gross = Decimal(str(sale_only.get("sale_units") or 0)).quantize(Decimal("0.001"))
        # Avg per completed bill uses sale-side totals (not net of returns processed later).
        avg_profit_per_unit = (
            money(sale_profit_gross / sale_units_gross) if sale_units_gross > 0 else Decimal("0.00")
        )
        avg_revenue_per_unit = (
            money(sale_revenue_gross / sale_units_gross) if sale_units_gross > 0 else Decimal("0.00")
        )
        avg_order_profit = (
            money(sale_profit_gross / Decimal(order_count)) if order_count > 0 else Decimal("0.00")
        )
        avg_order_revenue = (
            money(sale_revenue_gross / Decimal(order_count)) if order_count > 0 else Decimal("0.00")
        )
        # Profit still kept after returns/cancels (signed totals already netted).
        kept_profit = total_profit
        leakage_total = money(returns_profit_abs + cancels_profit_abs)
        kept_rate = (
            (kept_profit / sale_profit_gross * Decimal("100")).quantize(Decimal("0.01"))
            if sale_profit_gross > 0
            else Decimal("0.00")
        )
        # Classic owner pie: where sale money goes (skip empty slices).
        rupee_pie: list[dict[str, str]] = []
        for slice_row in (
            ("cogs", "What stock cost you", sale_cogs_gross, "#57534e"),
            ("profit", "Your profit", sale_profit_gross if sale_profit_gross > 0 else Decimal("0.00"), "#0f766e"),
            ("discounts", "Discounts you gave", discounts_total if discounts_total > 0 else Decimal("0.00"), "#b45309"),
            ("leakage", "Returns & cancels", leakage_total, "#b91c1c"),
        ):
            key, label, value, color = slice_row
            if value <= 0:
                continue
            rupee_pie.append(
                {
                    "key": key,
                    "label": label,
                    "value": str(money(value)),
                    "color": color,
                }
            )
        discount_rate = (
            (discounts_total / (total_revenue + discounts_total) * Decimal("100")).quantize(
                Decimal("0.01")
            )
            if (total_revenue + discounts_total) > 0
            else Decimal("0.00")
        )
        return_rate = (
            (returns_profit_abs / sale_profit_gross * Decimal("100")).quantize(Decimal("0.01"))
            if sale_profit_gross > 0
            else Decimal("0.00")
        )
        cancel_rate = (
            (cancels_profit_abs / sale_profit_gross * Decimal("100")).quantize(Decimal("0.01"))
            if sale_profit_gross > 0
            else Decimal("0.00")
        )
        cogs_ratio = (
            (total_cogs / total_revenue * Decimal("100")).quantize(Decimal("0.01"))
            if total_revenue > 0
            else Decimal("0.00")
        )
        top5_profit = sum(
            (Decimal(row["gross_profit"]) for row in top_profit_products[:5]),
            Decimal("0.00"),
        )
        top5_share = (
            (top5_profit / total_profit * Decimal("100")).quantize(Decimal("0.01"))
            if total_profit > 0
            else Decimal("0.00")
        )
        products_sold_count = sales_total
        low_sold_margin_count = sum(
            1
            for row in sales_built
            if Decimal(row["margin_percent"]) < Decimal("10") and Decimal(row["revenue"]) > 0
        )
        healthy_sold_margin_count = sum(
            1
            for row in sales_built
            if Decimal(row["margin_percent"]) >= Decimal("25") and Decimal(row["revenue"]) > 0
        )
        best_channel = max(by_channel_rows, key=lambda row: Decimal(row["gross_profit"]), default=None)
        best_weekday = max(by_weekday_rows, key=lambda row: Decimal(row["gross_profit"]), default=None)
        best_category = by_category_rows[0] if by_category_rows else None
        period_days = 1
        if parsed_from and parsed_to and parsed_to >= parsed_from:
            period_days = (parsed_to - parsed_from).days + 1
        avg_daily_profit = money(total_profit / Decimal(period_days)) if period_days else total_profit
        avg_daily_revenue = (
            money(total_amount_paid / Decimal(period_days)) if period_days else total_amount_paid
        )
        inventory_days_cover = (
            (Decimal(str(sum((Decimal(r["stock_on_hand"]) for r in catalog_rows), Decimal("0"))))
             / (total_units / Decimal(period_days))).quantize(Decimal("0.1"))
            if total_units > 0 and period_days > 0
            else Decimal("0.0")
        )

        # Human-readable insight bullets for the dashboard.
        narrative: list[dict[str, str]] = []
        if total_profit != 0 or total_revenue != 0:
            narrative.append(
                {
                    "tone": "neutral",
                    "title": "Period gross profit",
                    "detail": (
                        f"Gross profit {total_profit} on revenue {total_revenue} "
                        f"({margin_pct}% margin) across {total_units} units."
                    ),
                }
            )
        if comparison.get("profit_delta_percent"):
            delta = Decimal(str(comparison["profit_delta_percent"]))
            tone = "positive" if delta >= 0 else "warning"
            narrative.append(
                {
                    "tone": tone,
                    "title": "vs previous period",
                    "detail": (
                        f"Profit changed {delta}% vs "
                        f"{comparison['previous_from']} → {comparison['previous_to']}."
                    ),
                }
            )
        if top_profit_products:
            lead = top_profit_products[0]
            share = (
                (Decimal(lead["gross_profit"]) / total_profit * Decimal("100")).quantize(
                    Decimal("0.01")
                )
                if total_profit > 0
                else Decimal("0.00")
            )
            narrative.append(
                {
                    "tone": "positive",
                    "title": "Top profit product",
                    "detail": (
                        f"{lead['name']} contributed {lead['gross_profit']} "
                        f"({share}% of profit) on {lead['units_sold']} units."
                    ),
                }
            )
        if top5_share > 0:
            narrative.append(
                {
                    "tone": "neutral" if top5_share < 70 else "warning",
                    "title": "Profit concentration",
                    "detail": f"Top 5 products drive {top5_share}% of gross profit.",
                }
            )
        if by_channel_rows:
            best = max(by_channel_rows, key=lambda row: Decimal(row["gross_profit"]))
            narrative.append(
                {
                    "tone": "neutral",
                    "title": "Best channel",
                    "detail": (
                        f"{best['channel']} leads with profit {best['gross_profit']} "
                        f"at {best['margin_percent']}% margin."
                    ),
                }
            )
        if by_category_rows:
            best_cat = by_category_rows[0]
            narrative.append(
                {
                    "tone": "neutral",
                    "title": "Top category",
                    "detail": (
                        f"{best_cat['category']} earned {best_cat['gross_profit']} profit "
                        f"({best_cat['margin_percent']}% margin)."
                    ),
                }
            )
        if discounts_total > 0:
            narrative.append(
                {
                    "tone": "warning" if discount_rate >= Decimal("10") else "neutral",
                    "title": "Discount drag",
                    "detail": (
                        f"Discounts {discounts_total} "
                        f"(line {line_disc_total} + bill {bill_disc_total}) — "
                        f"{discount_rate}% of pre-discount revenue."
                    ),
                }
            )
        if returns_profit_abs > 0:
            narrative.append(
                {
                    "tone": "warning",
                    "title": "Returns impact",
                    "detail": f"Returns reversed {returns_profit_abs} of profit in this period.",
                }
            )
        if loss_maker_count:
            narrative.append(
                {
                    "tone": "warning",
                    "title": "Loss-making sales",
                    "detail": (
                        f"{loss_maker_count} product(s) sold below cost — "
                        f"worst: {loss_makers[0]['name']} ({loss_makers[0]['gross_profit']})."
                    ),
                }
            )
        if low_sold_margin_count:
            narrative.append(
                {
                    "tone": "warning",
                    "title": "Thin sold margins",
                    "detail": (
                        f"{low_sold_margin_count} sold product(s) have margin under 10%."
                    ),
                }
            )
        if missing_cost_count:
            narrative.append(
                {
                    "tone": "warning",
                    "title": "Missing cost data",
                    "detail": (
                        f"{missing_cost_count} catalog product(s) have no purchase/avg cost — "
                        "margins are incomplete."
                    ),
                }
            )
        if stock_risk:
            narrative.append(
                {
                    "tone": "warning",
                    "title": "Inventory risk",
                    "detail": (
                        f"{len(stock_risk)} in-stock product(s) under 10% catalog margin "
                        f"(largest tied capital: {stock_risk[0]['name']})."
                    ),
                }
            )
        if by_weekday_rows:
            best_day = max(by_weekday_rows, key=lambda row: Decimal(row["gross_profit"]))
            narrative.append(
                {
                    "tone": "positive",
                    "title": "Best weekday",
                    "detail": (
                        f"{best_day['label']} is strongest with profit {best_day['gross_profit']}."
                    ),
                }
            )

        return {
            "currency": business.currency or "INR",
            "date_from": date_from or "",
            "date_to": date_to or "",
            "channel": channel_key if channel_key != "all" else "all",
            "q": search,
            "sort": sort_key,
            "order": "asc" if not reverse else "desc",
            "limit": limit_n,
            "offset": offset_n,
            "sales_total": sales_total,
            "summary": {
                "product_count": len(catalog_rows),
                "products_sold_count": products_sold_count,
                "order_count": order_count,
                "period_days": period_days,
                "inventory_at_cost": str(money(inventory_at_cost)),
                "potential_profit": str(money(potential_profit)),
                "sales_revenue": str(total_amount_paid),
                "shelf_revenue": str(total_revenue),
                # Gross purchase cost of items sold (matches rupee pie); net stays as sales_cogs_net.
                "sales_cogs": str(sale_cogs_gross),
                "sales_cogs_net": str(total_cogs),
                "gross_profit": str(total_profit),
                "gross_margin_percent": str(margin_pct),
                "cogs_ratio_percent": str(cogs_ratio),
                "gst_collected": str(gst_collected),
                "gst_to_remit": str(gst_to_remit),
                "units_sold": str(total_units),
                "sale_units_gross": str(sale_units_gross),
                "sale_revenue_gross": str(sale_revenue_gross),
                "sale_cogs_gross": str(sale_cogs_gross),
                "sale_profit_gross": str(sale_profit_gross),
                "kept_profit": str(kept_profit),
                "kept_rate_percent": str(kept_rate),
                "leakage_total": str(leakage_total),
                "avg_profit_per_unit": str(avg_profit_per_unit),
                "avg_revenue_per_unit": str(avg_revenue_per_unit),
                "avg_order_profit": str(avg_order_profit),
                "avg_order_revenue": str(avg_order_revenue),
                "avg_daily_profit": str(avg_daily_profit),
                "avg_daily_revenue": str(avg_daily_revenue),
                "discounts_total": str(discounts_total),
                "line_discounts_total": str(line_disc_total),
                "bill_discounts_total": str(bill_disc_total),
                "discount_rate_percent": str(discount_rate),
                "returns_revenue": str(money(abs(Decimal(str(returns_agg.get("revenue") or 0))))),
                "returns_cogs": str(money(abs(Decimal(str(returns_agg.get("cogs") or 0))))),
                "returns_profit": str(returns_profit_abs),
                "return_rate_percent": str(return_rate),
                "cancels_profit": str(cancels_profit_abs),
                "cancel_rate_percent": str(cancel_rate),
                "top5_profit_share_percent": str(top5_share),
                "low_margin_sold_count": low_sold_margin_count,
                "healthy_margin_sold_count": healthy_sold_margin_count,
                "missing_cost_count": missing_cost_count,
                "loss_maker_count": loss_maker_count,
                "stock_risk_count": len(stock_risk),
                "inventory_days_cover": str(inventory_days_cover),
                "best_channel": (best_channel or {}).get("channel", ""),
                "best_channel_profit": (best_channel or {}).get("gross_profit", "0.00"),
                "best_weekday": (best_weekday or {}).get("label", ""),
                "best_weekday_profit": (best_weekday or {}).get("gross_profit", "0.00"),
                "best_category": (best_category or {}).get("category_label")
                or (best_category or {}).get("category", ""),
                "best_category_profit": (best_category or {}).get("gross_profit", "0.00"),
            },
            "comparison": comparison,
            "insights": narrative,
            "rupee_composition": rupee_pie,
            "by_channel": by_channel_rows,
            "by_category": by_category_rows,
            "by_weekday": by_weekday_rows,
            "series": series_rows,
            "catalog": catalog_rows,
            "top_margins": top_margins,
            "low_margins": low_margins,
            "top_profit_products": top_profit_products,
            "loss_makers": loss_makers,
            "stock_risk": stock_risk,
            "sales": sales_page,
        }


def _bulk_row_error(index: int, exc: Exception) -> dict[str, Any]:
    if isinstance(exc, ValidationError) and getattr(exc, "message_dict", None):
        field, messages = next(iter(exc.message_dict.items()))
        if isinstance(messages, (list, tuple)) and messages:
            message = str(messages[0])
        else:
            message = str(messages)
        return {"index": index, "code": str(field), "message": message}
    if isinstance(exc, ValidationError) and getattr(exc, "messages", None):
        return {"index": index, "code": "invalid", "message": str(exc.messages[0])}
    return {"index": index, "code": "invalid", "message": str(exc)}
