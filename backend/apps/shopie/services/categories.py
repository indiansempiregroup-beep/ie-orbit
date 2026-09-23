from __future__ import annotations

import re
from typing import Any

from django.db import transaction
from django.utils.text import slugify

from apps.shopie.models import ProductCategory, ShopProductCategory

# Builtin seed order matches ProductCategory / SHOP_PRODUCT_CATEGORIES.
BUILTIN_CATEGORIES: tuple[tuple[str, str, int], ...] = tuple(
    (choice.value, choice.label, index)
    for index, choice in enumerate(ProductCategory)
)

_GUESS_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"pet\s*food|dog food|cat food|en:pet-food", re.I), ProductCategory.PET_FOOD),
    (re.compile(r"pet\s*suppl|en:pet", re.I), ProductCategory.PET_SUPPLIES),
    (re.compile(r"beverage|drink|soft.?drink|juice|water", re.I), ProductCategory.BEVERAGES),
    (re.compile(r"snack|confection|chocolate|biscuit|cookie", re.I), ProductCategory.SNACKS),
    (re.compile(r"dairy|milk|cheese|yogurt|yoghurt", re.I), ProductCategory.DAIRY),
    (re.compile(r"personal.?care|shampoo|soap|toothpaste|cosmetic", re.I), ProductCategory.PERSONAL_CARE),
    (re.compile(r"household|cleaning|detergent|laundry", re.I), ProductCategory.HOUSEHOLD),
    (re.compile(r"baby|infant|diaper", re.I), ProductCategory.BABY_CARE),
    (re.compile(r"health|wellness|vitamin|supplement", re.I), ProductCategory.HEALTH),
    (re.compile(r"electronic|charger|cable|accessory", re.I), ProductCategory.ELECTRONICS),
    (re.compile(r"apparel|clothing|fashion|wear", re.I), ProductCategory.APPAREL),
    (re.compile(r"grocery|food|en:foods", re.I), ProductCategory.FOOD_GROCERY),
)


class CategoryService:
    """Ensure / list platform product categories (builtins + auto-created)."""

    def seed_builtins(self) -> int:
        created = 0
        for slug, label, sort_order in BUILTIN_CATEGORIES:
            _, was_created = ShopProductCategory.objects.get_or_create(
                slug=slug,
                defaults={"label": label, "is_builtin": True, "sort_order": sort_order},
            )
            if was_created:
                created += 1
        return created

    def list_categories(self) -> list[dict[str, Any]]:
        self.seed_builtins()
        return [
            {"slug": row.slug, "label": row.label, "is_builtin": row.is_builtin}
            for row in ShopProductCategory.objects.filter(is_active=True, deleted_at__isnull=True)
        ]

    def label_for(self, slug: str | None) -> str:
        raw = (slug or "").strip()
        if not raw:
            return ""
        row = ShopProductCategory.objects.filter(slug=raw).first()
        if row:
            return row.label
        for builtin_slug, label, _ in BUILTIN_CATEGORIES:
            if builtin_slug == raw:
                return label
        return raw.replace("_", " ").strip().title()

    @staticmethod
    def _normalize_slug(label: str) -> str:
        slug = slugify(label or "")[:64].strip("-")
        slug = re.sub(r"-+", "-", slug)
        return slug.replace("-", "_")[:64]

    @staticmethod
    def guess_builtin(raw: str) -> str | None:
        text = (raw or "").strip().lower()
        if not text:
            return None
        for slug, label, _ in BUILTIN_CATEGORIES:
            if text == slug or text == label.lower():
                return slug
        for pattern, slug in _GUESS_RULES:
            if pattern.search(text):
                return slug
        return None

    @transaction.atomic
    def ensure_category(self, *, label: str = "", slug: str = "") -> ShopProductCategory | None:
        """Resolve or create a category. Prefer builtins / guess rules before insert."""
        self.seed_builtins()
        text = (label or slug or "").strip()
        if not text:
            return None

        candidate_slug = self._normalize_slug(slug or text)
        if not candidate_slug:
            return None

        existing = ShopProductCategory.objects.filter(slug=candidate_slug).first()
        if existing:
            return existing

        by_label = ShopProductCategory.objects.filter(label__iexact=text).first()
        if by_label:
            return by_label

        guessed = self.guess_builtin(text)
        if guessed:
            row = ShopProductCategory.objects.filter(slug=guessed).first()
            if row:
                return row

        # Do not create a clone of Other — create a real category from free text.
        if candidate_slug == ProductCategory.OTHER and text.lower() not in {"other", "misc", "miscellaneous"}:
            candidate_slug = self._normalize_slug(text)
            if candidate_slug == ProductCategory.OTHER:
                candidate_slug = f"cat_{abs(hash(text)) % 10_000_000}"

        display = text if label else text.replace("_", " ").strip().title()
        row, _ = ShopProductCategory.objects.get_or_create(
            slug=candidate_slug,
            defaults={
                "label": display[:120],
                "is_builtin": False,
                "sort_order": 200,
            },
        )
        return row

    def resolve_from_enrichment(self, *, categories_raw: str = "", preferred_label: str = "") -> dict[str, str]:
        """Map catalog/vision category text onto a slug (+ label) for form/GTIN storage."""
        raw = (preferred_label or categories_raw or "").strip()
        if not raw:
            return {"category": "", "category_label": "", "categories": categories_raw or ""}

        # Prefer the first segment of Open*Facts style "A, B, C".
        primary = preferred_label.strip() if preferred_label else raw.split(",")[0].strip()
        guessed = self.guess_builtin(primary) or self.guess_builtin(raw)
        if guessed:
            row = self.ensure_category(slug=guessed, label="")
            return {
                "category": row.slug if row else guessed,
                "category_label": row.label if row else self.label_for(guessed),
                "categories": categories_raw or raw,
            }

        row = self.ensure_category(label=primary)
        if not row:
            return {"category": "", "category_label": "", "categories": categories_raw or raw}
        return {
            "category": row.slug,
            "category_label": row.label,
            "categories": categories_raw or raw,
        }
