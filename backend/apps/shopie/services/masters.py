from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils.text import slugify

from apps.businesses.models import Business
from apps.shopie.models import ProductCategory, ProductStatus, ShopMasterKind, ShopMasterRecord, ShopProduct
from apps.shopie.services.categories import BUILTIN_CATEGORIES, CategoryService
from apps.tenancy.models import Tenant

DEFAULT_UNITS: tuple[tuple[str, str, int], ...] = (
    ("pcs", "Pcs", 10),
    ("kg", "Kg", 20),
    ("g", "g", 30),
    ("ltr", "Litre", 40),
    ("ml", "ml", 50),
    ("pack", "Pack", 60),
    ("box", "Box", 70),
    ("dozen", "Dozen", 80),
)

DEFAULT_EXPENSE_CATEGORIES: tuple[str, ...] = (
    "Rent",
    "Utilities",
    "Electricity",
    "Salaries",
    "Transport",
    "Supplies",
    "Packaging",
    "Maintenance",
    "Marketing",
    "Other",
)

DEFAULT_INCOME_CATEGORIES: tuple[str, ...] = (
    "Interest",
    "Commission",
    "Rent income",
    "Scrap sale",
    "Other",
)

DEFAULT_TAX_RATES: tuple[tuple[str, str, str, int], ...] = (
    ("gst_0", "GST 0%", "0", 10),
    ("gst_5", "GST 5%", "5", 20),
    ("gst_12", "GST 12%", "12", 30),
    ("gst_18", "GST 18%", "18", 40),
    ("gst_28", "GST 28%", "28", 50),
)


class MasterService:
    """Shop-scoped master files (categories, brands, units, ledger cats, tax rates)."""

    categories = CategoryService()

    @staticmethod
    def normalize_slug(label: str) -> str:
        slug = slugify(label or "")[:64].strip("-")
        slug = re.sub(r"-+", "-", slug)
        return slug.replace("-", "_")[:64]

    def seed_defaults(self, *, tenant: Tenant, business: Business) -> None:
        self._seed_kind(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.CATEGORY,
            rows=[
                (slug, label, "", sort_order, True)
                for slug, label, sort_order in BUILTIN_CATEGORIES
            ],
        )
        self._seed_kind(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.UNIT,
            rows=[(slug, label, "", sort_order, True) for slug, label, sort_order in DEFAULT_UNITS],
        )
        self._seed_kind(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.EXPENSE_CATEGORY,
            rows=[
                (self.normalize_slug(label), label, "", 100 + index, True)
                for index, label in enumerate(DEFAULT_EXPENSE_CATEGORIES)
            ],
        )
        self._seed_kind(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.INCOME_CATEGORY,
            rows=[
                (self.normalize_slug(label), label, "", 100 + index, True)
                for index, label in enumerate(DEFAULT_INCOME_CATEGORIES)
            ],
        )
        self._seed_kind(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.TAX_RATE,
            rows=[
                (slug, label, value, sort_order, True)
                for slug, label, value, sort_order in DEFAULT_TAX_RATES
            ],
        )

    def _seed_kind(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        rows: list[tuple[str, str, str, int, bool]],
    ) -> None:
        for slug, label, value, sort_order, is_builtin in rows:
            if not slug:
                continue
            ShopMasterRecord.objects.get_or_create(
                tenant=tenant,
                business=business,
                kind=kind,
                slug=slug,
                defaults={
                    "label": label[:120],
                    "value": value[:64],
                    "is_builtin": is_builtin,
                    "sort_order": sort_order,
                    "is_active": True,
                },
            )

    def list_records(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        self.seed_defaults(tenant=tenant, business=business)
        qs = ShopMasterRecord.objects.filter(
            tenant=tenant,
            business=business,
            kind=kind,
            deleted_at__isnull=True,
        )
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return [self.serialize(row) for row in qs.order_by("sort_order", "label")]

    def serialize(self, row: ShopMasterRecord) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "kind": row.kind,
            "slug": row.slug,
            "label": row.label,
            "value": row.value,
            "is_builtin": row.is_builtin,
            "sort_order": row.sort_order,
            "is_active": row.is_active,
        }

    def category_labels_map(self, *, tenant: Tenant, business: Business) -> dict[str, str]:
        self.seed_defaults(tenant=tenant, business=business)
        rows = ShopMasterRecord.objects.filter(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.CATEGORY,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("slug", "label")
        return {slug: label for slug, label in rows if slug}

    def list_customer_filters(self, *, tenant: Tenant, business: Business) -> dict[str, Any]:
        """Active category/brand masters used by the shop's catalog (customer-facing)."""
        self.seed_defaults(tenant=tenant, business=business)
        product_qs = ShopProduct.objects.filter(
            tenant=tenant,
            business=business,
            status=ProductStatus.ACTIVE,
            deleted_at__isnull=True,
        )
        used_categories = {
            str(value).strip()
            for value in product_qs.exclude(category="").values_list("category", flat=True)
            if str(value or "").strip()
        }
        used_brands = {
            str(value).strip()
            for value in product_qs.exclude(brand="").values_list("brand", flat=True)
            if str(value or "").strip()
        }
        for brand in used_brands:
            self.ensure(tenant=tenant, business=business, kind=ShopMasterKind.BRAND, label=brand)
        for category in used_categories:
            self.ensure(tenant=tenant, business=business, kind=ShopMasterKind.CATEGORY, slug=category, label=category)

        category_rows = ShopMasterRecord.objects.filter(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.CATEGORY,
            is_active=True,
            deleted_at__isnull=True,
        ).order_by("sort_order", "label")
        brand_rows = ShopMasterRecord.objects.filter(
            tenant=tenant,
            business=business,
            kind=ShopMasterKind.BRAND,
            is_active=True,
            deleted_at__isnull=True,
        ).order_by("sort_order", "label")

        brands_lower = {brand.lower() for brand in used_brands}

        def brand_is_used(row: ShopMasterRecord) -> bool:
            candidates = {
                row.label.strip().lower(),
                row.slug.strip().lower(),
                row.slug.replace("_", " ").strip().lower(),
            }
            return bool(candidates & brands_lower)

        categories = [
            {"slug": row.slug, "label": row.label}
            for row in category_rows
            if row.slug in used_categories
        ]
        brands = [
            {"slug": row.slug, "label": row.label}
            for row in brand_rows
            if brand_is_used(row)
        ]
        return {"categories": categories, "brands": brands}

    @transaction.atomic
    def ensure(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        label: str = "",
        slug: str = "",
        value: str = "",
    ) -> ShopMasterRecord | None:
        self.seed_defaults(tenant=tenant, business=business)
        text = (label or slug or "").strip()
        if not text:
            return None

        candidate_slug = self.normalize_slug(slug or text)
        if not candidate_slug:
            return None

        existing = ShopMasterRecord.objects.filter(
            tenant=tenant, business=business, kind=kind, slug=candidate_slug
        ).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.save(update_fields=["is_active", "updated_at"])
            return existing

        by_label = ShopMasterRecord.objects.filter(
            tenant=tenant, business=business, kind=kind, label__iexact=text
        ).first()
        if by_label:
            if not by_label.is_active:
                by_label.is_active = True
                by_label.save(update_fields=["is_active", "updated_at"])
            return by_label

        if kind == ShopMasterKind.CATEGORY:
            guessed = self.categories.guess_builtin(text)
            if guessed:
                row = ShopMasterRecord.objects.filter(
                    tenant=tenant, business=business, kind=kind, slug=guessed
                ).first()
                if row:
                    return row
            if candidate_slug == ProductCategory.OTHER and text.lower() not in {
                "other",
                "misc",
                "miscellaneous",
            }:
                candidate_slug = self.normalize_slug(text)
                if candidate_slug == ProductCategory.OTHER:
                    candidate_slug = f"cat_{abs(hash(text)) % 10_000_000}"

        if kind == ShopMasterKind.TAX_RATE and not value:
            try:
                value = str(Decimal(text.replace("%", "").strip()))
            except Exception:
                value = text

        display = text if label else text.replace("_", " ").strip().title()
        row, _ = ShopMasterRecord.objects.get_or_create(
            tenant=tenant,
            business=business,
            kind=kind,
            slug=candidate_slug,
            defaults={
                "label": display[:120],
                "value": (value or "")[:64],
                "is_builtin": False,
                "sort_order": 200,
                "is_active": True,
            },
        )
        return row

    @transaction.atomic
    def create(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        label: str,
        value: str = "",
        slug: str = "",
    ) -> ShopMasterRecord:
        row = self.ensure(
            tenant=tenant,
            business=business,
            kind=kind,
            label=label,
            slug=slug,
            value=value,
        )
        if not row:
            raise ValueError("Provide a name.")
        return row

    @transaction.atomic
    def update(
        self,
        *,
        tenant: Tenant,
        business: Business,
        record: ShopMasterRecord,
        data: dict[str, Any],
    ) -> ShopMasterRecord:
        if record.tenant_id != tenant.id or record.business_id != business.id:
            raise ValueError("Master record not found.")
        if "label" in data and data["label"] is not None:
            record.label = str(data["label"]).strip()[:120]
        if "value" in data and data["value"] is not None:
            record.value = str(data["value"]).strip()[:64]
        if "is_active" in data and data["is_active"] is not None:
            record.is_active = bool(data["is_active"])
        if "sort_order" in data and data["sort_order"] is not None:
            record.sort_order = int(data["sort_order"])
        if "slug" in data and data["slug"] and not record.is_builtin:
            new_slug = self.normalize_slug(str(data["slug"]))
            if new_slug and new_slug != record.slug:
                clash = ShopMasterRecord.objects.filter(
                    tenant=tenant,
                    business=business,
                    kind=record.kind,
                    slug=new_slug,
                ).exclude(id=record.id)
                if not clash.exists():
                    record.slug = new_slug
        record.save()
        return record
