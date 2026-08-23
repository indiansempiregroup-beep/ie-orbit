from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Q, QuerySet

from apps.businesses.models import Business
from apps.shopie.models import (
    BarcodeType,
    ProductCategory,
    ProductStatus,
    ShopProduct,
    ShopProductBarcode,
    ShopStockMovement,
    StockMovementType,
)
from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.shopie.services.html_sanitize import sanitize_product_html
from apps.tenancy.models import Tenant


class CatalogService:
    enrichment = ProductEnrichmentService()

    def list_products(
        self,
        *,
        tenant: Tenant,
        business: Business,
        search: str | None = None,
        status: str | None = None,
        category: str | None = None,
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
            tax_rate=Decimal(str(data.get("tax_rate") or "0")),
            hsn_sac=str(data.get("hsn_sac") or "").strip(),
            gst_rate=Decimal(str(data.get("gst_rate") if data.get("gst_rate") is not None else data.get("tax_rate") or "0")),
            batch_tracking_enabled=bool(data.get("batch_tracking_enabled") or False),
            currency=str(data.get("currency") or business.currency or "INR"),
            stock_on_hand=Decimal("0"),
            low_stock_threshold=Decimal(str(data.get("low_stock_threshold") or "0")),
            pack_size=str(data.get("pack_size") or "").strip(),
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
            )
        return self.get_product(tenant=tenant, business=business, product_id=product.id)

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
            "image_url",
            "hsn_sac",
        ):
            if field in data and data[field] is not None:
                value = str(data[field]).strip() if isinstance(data[field], str) else data[field]
                if field == "details_html":
                    value = sanitize_product_html(str(value) if value is not None else "")
                setattr(product, field, value)
        for field in ("price", "tax_rate", "gst_rate", "low_stock_threshold"):
            if field in data and data[field] is not None:
                setattr(product, field, Decimal(str(data[field])))
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
                product = self.adjust_stock(
                    tenant=tenant,
                    business=business,
                    product=product,
                    quantity_delta=delta,
                    movement_type=StockMovementType.ADJUST,
                    reason="Manual stock edit",
                    godown_id=data.get("godown_id"),
                )
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
        return self.get_product(tenant=tenant, business=business, product_id=product.id)

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
    ) -> ShopProduct:
        quantity_delta = Decimal(str(quantity_delta or "0"))
        new_qty = product.stock_on_hand + quantity_delta
        if new_qty < 0:
            raise ValidationError({"stock_on_hand": "Insufficient stock."})
        product.stock_on_hand = new_qty
        product.save(update_fields=["stock_on_hand", "updated_at", "version"])
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
        raw = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
        if not raw:
            return ""
        if raw in ProductCategory.values:
            return raw
        # Map free-text / enrichment labels onto catalog choices.
        aliases = {
            "food": ProductCategory.FOOD_GROCERY,
            "grocery": ProductCategory.FOOD_GROCERY,
            "food_grocery": ProductCategory.FOOD_GROCERY,
            "pet": ProductCategory.PET_FOOD,
            "petfood": ProductCategory.PET_FOOD,
            "pet_food": ProductCategory.PET_FOOD,
            "pets": ProductCategory.PET_SUPPLIES,
            "drink": ProductCategory.BEVERAGES,
            "drinks": ProductCategory.BEVERAGES,
            "beverage": ProductCategory.BEVERAGES,
            "snack": ProductCategory.SNACKS,
            "confectionery": ProductCategory.SNACKS,
            "personalcare": ProductCategory.PERSONAL_CARE,
            "household_goods": ProductCategory.HOUSEHOLD,
            "baby": ProductCategory.BABY_CARE,
            "health_wellness": ProductCategory.HEALTH,
            "wellness": ProductCategory.HEALTH,
            "electronics_accessories": ProductCategory.ELECTRONICS,
            "clothing": ProductCategory.APPAREL,
            "fashion": ProductCategory.APPAREL,
        }
        if raw in aliases:
            return aliases[raw]
        for choice in ProductCategory.values:
            if choice in raw or raw in choice:
                return choice
        for label, code in (
            ("pet food", ProductCategory.PET_FOOD),
            ("pet supplies", ProductCategory.PET_SUPPLIES),
            ("personal care", ProductCategory.PERSONAL_CARE),
            ("baby care", ProductCategory.BABY_CARE),
            ("food & grocery", ProductCategory.FOOD_GROCERY),
            ("health", ProductCategory.HEALTH),
        ):
            if label in raw.replace("_", " "):
                return code
        return ProductCategory.OTHER

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
