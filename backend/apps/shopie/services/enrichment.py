from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from apps.shopie.models import BarcodeType, PlatformGtinCatalog, ShopProduct
from apps.shopie.services.barcode_providers import (
    barcode_api_configured,
    gtin_variants,
    lookup_commercial_barcode,
)
from apps.shopie.services.categories import CategoryService

logger = logging.getLogger(__name__)

USER_AGENT = "IE-Orbit-ShopIE/1.0 (product enrichment)"
BARCODE_RE = re.compile(r"\b(\d{8}|\d{12,14})\b")
HTTP_TIMEOUT_SECONDS = 2.0

# Common retail brand tokens that should prefer pet / specialty catalogs.
PET_BRAND_HINTS = {
    "pedigree",
    "whiskas",
    "sheba",
    "royal canin",
    "purina",
    "drools",
    "hills",
    "hill's",
    "cesar",
    "fancy feast",
    "iams",
    "eukanuba",
    "nulo",
    "orijen",
    "acana",
    "farmina",
    "me-o",
    "meo",
    "catchow",
    "dogchow",
}


class ProductEnrichmentService:
    """Barcode-first enrichment: Postgres GTIN → Open*Facts (parallel) → optional vision."""

    CATALOGS = (
        {
            "name": "open_pet_food_facts",
            "product_url": "https://world.openpetfoodfacts.org/api/v2/product/{code}.json",
            "search_url": "https://world.openpetfoodfacts.org/cgi/search.pl",
            "brand_search_url": "https://world.openpetfoodfacts.org/api/v2/search",
        },
        {
            "name": "open_food_facts",
            "product_url": "https://world.openfoodfacts.org/api/v2/product/{code}.json",
            "search_url": "https://search.openfoodfacts.org/search",
            "brand_search_url": "https://world.openfoodfacts.org/api/v2/search",
        },
        {
            "name": "open_products_facts",
            "product_url": "https://world.openproductsfacts.org/api/v2/product/{code}.json",
            "search_url": "",
            "brand_search_url": "https://world.openproductsfacts.org/api/v2/search",
        },
        {
            "name": "open_beauty_facts",
            "product_url": "https://world.openbeautyfacts.org/api/v2/product/{code}.json",
            "search_url": "",
            "brand_search_url": "https://world.openbeautyfacts.org/api/v2/search",
        },
    )

    categories = CategoryService()

    @staticmethod
    def with_user_message(result: dict[str, Any]) -> dict[str, Any]:
        """Ensure API payloads expose a shop-owner-friendly message (never raw source keys)."""
        if not isinstance(result, dict):
            return result
        existing = str(result.get("message") or "").strip()
        if existing and "platform_gtin" not in existing and "_barcode" not in existing:
            # Keep explicit messages unless they leak internal source tokens.
            if not any(
                token in existing
                for token in (
                    "gemini_text",
                    "gemini_vision",
                    "open_food",
                    "open_pet",
                    "open_product",
                    "open_beauty",
                    "barcode_lookup",
                    "shop_catalog",
                    "shop_shared",
                    "commercial_",
                    "image_hint",
                )
            ):
                return result

        source = str(result.get("source") or "").strip()
        found = bool(result.get("found"))
        charged = result.get("charged_paise")
        charge_note = ""
        try:
            if charged is not None and int(charged) > 0:
                charge_note = f" (₹{int(charged) / 100:.2f})"
        except (TypeError, ValueError):
            charge_note = ""

        if source == "platform_gtin":
            message = "Filled from our product catalog. Review price and stock, then save."
        elif source == "shop_catalog":
            name = str(result.get("existing_product_name") or result.get("name") or "this product").strip()
            message = f"Already in your catalog as {name}."
        elif source == "shop_shared":
            message = "Filled from products saved by shops on the platform. Review price and stock, then save."
        elif source.startswith("commercial_"):
            message = (
                "Filled from a barcode data provider. Review price and stock, then save."
                if found
                else "No match from the barcode data provider."
            )
        elif source in {"gemini_vision"}:
            message = (
                f"Filled from pack photo{charge_note}. Review carefully, then save."
                if found
                else "Could not read the pack photo clearly. Try again or fill details manually."
            )
        elif source in {"gemini_text"}:
            message = (
                f"Filled by Smart lookup{charge_note}. Review carefully — a pack photo improves accuracy."
                if found
                else "Smart lookup could not identify this barcode. Take a pack photo or enter details manually."
            )
        elif source.endswith("_barcode") or source.startswith("open_"):
            message = (
                "Filled from an online product database. Review price and stock, then save."
                if found
                else "No online match for this barcode — take a pack photo or fill details manually."
            )
        elif source == "barcode_lookup":
            message = "No online match for this barcode — take a pack photo or fill details manually."
        elif source == "image_hint":
            message = "Photo saved. Scan the barcode or enter the product name to look up details."
        elif found:
            message = "Product details filled. Review price and stock, then save."
        else:
            message = "No match yet. Take a pack photo or enter details manually."

        result["message"] = message
        return result

    def enrich(self, *, code: str = "", query: str = "", prefer_pet: bool = False) -> dict[str, Any]:
        normalized_code = self._normalize_code(code)
        search_query = (query or "").strip()

        if normalized_code:
            variants = gtin_variants(normalized_code) or [normalized_code]
            for variant in variants:
                cached = self._from_platform_gtin(variant)
                if cached:
                    # Keep the scanned/typed code on the form when possible.
                    cached["code"] = normalized_code
                    cached["sku"] = normalized_code
                    return self.with_user_message(cached)

            result: dict[str, Any] = {"found": False, "code": normalized_code, "source": "barcode_lookup"}
            for variant in variants:
                prefer = prefer_pet or self.looks_like_pet_query(variant)
                hit = self._fetch_by_barcode(variant, prefer_pet=prefer)
                if hit.get("found"):
                    result = hit
                    result["code"] = normalized_code
                    break

            if not result.get("found") and barcode_api_configured():
                commercial = lookup_commercial_barcode(normalized_code)
                if commercial and commercial.get("found") and commercial.get("name"):
                    commercial["code"] = normalized_code
                    commercial["sku"] = normalized_code
                    result = commercial

            if result.get("found"):
                result = self._attach_category(result)
                self._upsert_platform_gtin(result)
            return self.with_user_message(result)

        if search_query:
            prefer_pet = prefer_pet or self.looks_like_pet_query(search_query)
            result = self._search(search_query, prefer_pet=prefer_pet)
            if result.get("found"):
                result = self._attach_category(result)
                if result.get("code"):
                    self._upsert_platform_gtin(result)
            return self.with_user_message(result)

        return self.with_user_message(
            {"found": False, "code": code or "", "source": None, "confidence": "none"}
        )

    def contribute_from_shop_product(self, product: ShopProduct) -> int:
        """Share manufacturer GTINs from a shop product into the platform catalog (no shop price)."""
        if not product or not str(product.name or "").strip():
            return 0
        contributed = 0
        barcodes = list(getattr(product, "barcodes", None).all() if hasattr(product, "barcodes") else [])
        if not barcodes:
            return 0
        metadata = product.metadata if isinstance(product.metadata, dict) else {}
        images_meta = metadata.get("images") if isinstance(metadata.get("images"), dict) else {}
        gallery = images_meta.get("gallery") if isinstance(images_meta.get("gallery"), list) else []
        gallery_urls = [str(item).strip() for item in gallery if str(item or "").strip()][:5]
        front = str(images_meta.get("front") or product.image_url or "").strip()
        if front and front not in gallery_urls:
            gallery_urls = [front, *gallery_urls][:5]
        image_url = gallery_urls[0] if gallery_urls else front

        for row in barcodes:
            barcode_type = str(getattr(row, "barcode_type", "") or "")
            if barcode_type in {BarcodeType.INTERNAL, BarcodeType.RFID_EPC}:
                continue
            code = self._normalize_code(str(getattr(row, "code", "") or ""))
            if not code or not self.is_plausible_barcode(code):
                continue
            has_image = bool(image_url)
            payload = {
                "found": True,
                "code": code,
                "source": "shop_shared",
                "sku": code,
                "name": str(product.name or "").strip()[:200],
                "brand": str(product.brand or "").strip()[:120],
                "pack_size": str(product.pack_size or "").strip()[:80],
                "serving_size": "",
                "description": str(product.description or "").strip()[:2000],
                "details_html": str(product.details_html or "")[:10000],
                "categories": "",
                "category": str(product.category or "").strip()[:64],
                "category_label": self.categories.label_for(product.category),
                "hsn_sac": str(product.hsn_sac or "").strip()[:16],
                "gst_rate": str(product.gst_rate or product.tax_rate or "0"),
                # Never copy shop selling price into the shared catalog.
                "mrp": "0",
                "image_url": image_url[:1024],
                "front_image_url": image_url[:1024],
                "back_image_url": "",
                "images": {"front": image_url, "back": "", "gallery": gallery_urls},
                "confidence": "high" if has_image else "medium",
                "needs_pack_photo": not has_image,
                "message": "Shared from a shop catalog save.",
                "metadata": {"enrichment_source": "shop_shared"},
            }
            payload = self._attach_category(payload)
            self._upsert_platform_gtin(payload)
            contributed += 1
        return contributed

    def enrich_from_image_hint(self, *, image_url: str = "", hint: str = "") -> dict[str, Any]:
        image_url = (image_url or "").strip()
        hint = (hint or "").strip()
        barcode_candidates = [c for c in BARCODE_RE.findall(f"{hint} {image_url}") if self.is_plausible_barcode(c)]
        prefer_pet = self.looks_like_pet_query(hint)

        for candidate in barcode_candidates:
            result = self.enrich(code=candidate, prefer_pet=prefer_pet)
            if result.get("found"):
                return {
                    **result,
                    "image_url": result.get("image_url") or image_url,
                    "local_image_url": image_url,
                    "front_image_url": result.get("front_image_url") or image_url,
                }

        if hint:
            result = self.enrich(query=hint, prefer_pet=prefer_pet)
            if result.get("found"):
                return {
                    **result,
                    "image_url": image_url or result.get("image_url") or "",
                    "local_image_url": image_url,
                }

        return self.with_user_message(
            {
                "found": False,
                "code": barcode_candidates[0] if barcode_candidates else "",
                "source": "image_hint",
                "image_url": image_url,
                "local_image_url": image_url,
                "needs_pack_photo": True,
                "confidence": "none",
            }
        )

    def upsert_from_vision(self, result: dict[str, Any]) -> dict[str, Any]:
        """Persist a Gemini / packaging vision hit into the platform GTIN table."""
        if not result.get("found"):
            return result
        enriched = self._attach_category(result)
        if enriched.get("code"):
            self._upsert_platform_gtin(enriched)
        return enriched

    @staticmethod
    def looks_like_pet_query(text: str) -> bool:
        lowered = (text or "").lower()
        if any(token in lowered for token in ("dog", "cat", "puppy", "kitten", "pet food", "petfood")):
            return True
        return any(brand in lowered for brand in PET_BRAND_HINTS)

    @staticmethod
    def is_plausible_barcode(code: str) -> bool:
        digits = "".join(ch for ch in (code or "") if ch.isdigit())
        if len(digits) not in {8, 12, 13, 14}:
            return False
        if set(digits) == {"0"}:
            return False
        if digits.startswith("0000") or digits.endswith("000000"):
            return False
        return ProductEnrichmentService._gtin_checksum_ok(digits)

    @staticmethod
    def _gtin_checksum_ok(digits: str) -> bool:
        if len(digits) not in {8, 12, 13, 14}:
            return False
        body, check = digits[:-1], int(digits[-1])
        total = 0
        for index, char in enumerate(reversed(body)):
            weight = 3 if index % 2 == 0 else 1
            total += int(char) * weight
        return (10 - (total % 10)) % 10 == check

    def _normalize_code(self, code: str) -> str:
        return "".join(ch for ch in (code or "").strip() if ch.isalnum())

    def _catalogs(self, *, prefer_pet: bool) -> tuple[dict[str, str], ...]:
        food, pet, products, beauty = self.CATALOGS[1], self.CATALOGS[0], self.CATALOGS[2], self.CATALOGS[3]
        if prefer_pet:
            return (pet, food, products, beauty)
        return (food, pet, products, beauty)

    def _http_get_json(self, url: str) -> dict[str, Any] | None:
        try:
            request = urllib_request.Request(
                url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
            )
            with urllib_request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib_error.URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
            logger.info("Enrichment HTTP failed for %s: %s", url, exc)
            return None

    def _map_product(self, *, code: str, product: dict[str, Any], source: str) -> dict[str, Any]:
        name = (
            product.get("product_name")
            or product.get("product_name_en")
            or product.get("generic_name")
            or ""
        )
        brand = product.get("brands") or ""
        quantity = product.get("quantity") or product.get("product_quantity") or ""
        serving = product.get("serving_size") or ""
        front = (
            product.get("image_front_url")
            or product.get("image_url")
            or product.get("image_small_url")
            or ""
        )
        back = product.get("image_packaging_url") or product.get("image_ingredients_url") or ""
        extras = [
            str(product.get("image_nutrition_url") or "").strip(),
            str(product.get("image_ingredients_url") or "").strip(),
            str(product.get("image_packaging_url") or "").strip(),
        ]
        gallery = []
        for url in [front, back, *extras]:
            cleaned = str(url or "").strip()
            if cleaned and cleaned not in gallery:
                gallery.append(cleaned)
            if len(gallery) >= 5:
                break

        description = (
            product.get("generic_name")
            or product.get("ingredients_text")
            or product.get("ingredients_text_en")
            or ""
        )
        categories = product.get("categories") or ""
        if isinstance(categories, list):
            categories = ", ".join(str(item) for item in categories if item)

        mrp = Decimal("0.00")
        for key in ("price", "product_price", "mrp"):
            raw = product.get(key)
            if raw is None or raw == "":
                continue
            try:
                mrp = Decimal(str(raw).replace(",", "").strip())
                break
            except (InvalidOperation, ValueError):
                continue

        return {
            "found": True,
            "code": str(code or product.get("code") or "").strip(),
            "source": source,
            "sku": str(code or product.get("code") or "").strip(),
            "name": str(name).strip(),
            "brand": str(brand).split(",")[0].strip() if brand else "",
            "pack_size": str(quantity).strip(),
            "serving_size": str(serving).strip(),
            "image_url": str(front).strip(),
            "front_image_url": str(front).strip(),
            "back_image_url": str(back).strip(),
            "images": {"front": str(front).strip(), "back": str(back).strip(), "gallery": gallery},
            "description": str(description).strip()[:2000],
            "details_html": "",
            "categories": str(categories).strip()[:500],
            "mrp": str(mrp),
            "hsn_sac": "",
            "gst_rate": "0",
            "confidence": "high" if source.endswith("_barcode") or "product" in source else "medium",
            "needs_pack_photo": False,
            "metadata": {
                "enrichment_source": source,
                "categories": str(categories).strip()[:500],
                "serving_size": str(serving).strip(),
                "quantity": str(quantity).strip(),
            },
        }

    def _product_status_ok(self, payload: dict[str, Any]) -> bool:
        if int(payload.get("status") or 0) == 1:
            return True
        status = payload.get("status")
        if isinstance(status, str) and status.lower() in {"success", "found"}:
            return True
        return bool(payload.get("product"))

    def _fetch_one_catalog(self, catalog: dict[str, str], code: str) -> dict[str, Any] | None:
        url = catalog["product_url"].format(code=code)
        payload = self._http_get_json(url)
        if not payload or not self._product_status_ok(payload):
            return None
        product = payload.get("product") or {}
        if not product:
            return None
        mapped = self._map_product(code=code, product=product, source=f"{catalog['name']}_barcode")
        mapped["confidence"] = "high"
        return mapped

    def _fetch_by_barcode(self, code: str, *, prefer_pet: bool) -> dict[str, Any]:
        catalogs = self._catalogs(prefer_pet=prefer_pet)
        # Race catalogs in parallel; first found wins.
        with ThreadPoolExecutor(max_workers=len(catalogs)) as pool:
            futures = {pool.submit(self._fetch_one_catalog, catalog, code): catalog for catalog in catalogs}
            for future in as_completed(futures):
                try:
                    mapped = future.result()
                except Exception as exc:  # noqa: BLE001 — keep scanning other catalogs
                    logger.info("Enrichment catalog future failed: %s", exc)
                    continue
                if mapped and mapped.get("found"):
                    return mapped
        return {
            "found": False,
            "code": code,
            "source": "barcode_lookup",
            "confidence": "none",
            "needs_pack_photo": True,
            "message": "No online match for this barcode — take a pack photo or fill details manually.",
        }

    def _search(self, query: str, *, prefer_pet: bool) -> dict[str, Any]:
        for catalog in self._catalogs(prefer_pet=prefer_pet):
            product = self._search_catalog(catalog, query)
            if product:
                mapped = self._map_product(
                    code=str(product.get("code") or ""),
                    product=product,
                    source=f"{catalog['name']}_search",
                )
                mapped["query"] = query
                mapped["confidence"] = "medium"
                return mapped
        return {
            "found": False,
            "code": "",
            "source": "catalog_search",
            "query": query,
            "confidence": "none",
            "needs_pack_photo": False,
        }

    def _search_catalog(self, catalog: dict[str, str], query: str) -> dict[str, Any] | None:
        if catalog.get("search_url") and "search.openfoodfacts.org" in catalog["search_url"]:
            params = urllib_parse.urlencode(
                {
                    "q": query,
                    "page_size": 5,
                    "fields": "code,product_name,product_name_en,generic_name,brands,quantity,"
                    "serving_size,image_front_url,image_url,ingredients_text,ingredients_text_en,categories",
                }
            )
            payload = self._http_get_json(f"{catalog['search_url']}?{params}")
            hits = (payload or {}).get("hits") or (payload or {}).get("products") or []
            return self._best_search_hit(hits, query)

        if catalog.get("search_url") and "cgi/search.pl" in catalog["search_url"]:
            params = urllib_parse.urlencode(
                {
                    "search_terms": query,
                    "search_simple": 1,
                    "action": "process",
                    "json": 1,
                    "page_size": 5,
                }
            )
            payload = self._http_get_json(f"{catalog['search_url']}?{params}")
            hits = (payload or {}).get("products") or []
            return self._best_search_hit(hits, query)

        brand_url = catalog.get("brand_search_url") or ""
        if brand_url:
            fallback_params = urllib_parse.urlencode(
                {
                    "brands_tags": query.lower().replace(" ", "-"),
                    "page_size": 5,
                    "fields": "code,product_name,brands,quantity,serving_size,image_front_url,"
                    "ingredients_text,categories",
                }
            )
            payload = self._http_get_json(f"{brand_url}?{fallback_params}")
            hits = (payload or {}).get("products") or []
            return self._best_search_hit(hits, query)
        return None

    def _best_search_hit(self, hits: list[Any], query: str) -> dict[str, Any] | None:
        query_tokens = {token for token in re.findall(r"[a-z0-9]+", query.lower()) if len(token) > 2}
        ranked: list[tuple[int, dict[str, Any]]] = []
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            product = hit.get("product") if isinstance(hit.get("product"), dict) else hit
            haystack = " ".join(
                [
                    str(product.get("product_name") or ""),
                    str(product.get("product_name_en") or ""),
                    str(product.get("brands") or ""),
                    str(product.get("generic_name") or ""),
                ]
            ).lower()
            score = sum(1 for token in query_tokens if token in haystack)
            if score <= 0 and query_tokens:
                continue
            ranked.append((score, product))
        if not ranked:
            return None
        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked[0][1]

    def _attach_category(self, result: dict[str, Any]) -> dict[str, Any]:
        categories_raw = str(result.get("categories") or "")
        preferred = str(result.get("category_label") or "").strip()
        if not preferred and categories_raw:
            preferred = categories_raw.split(",")[0].strip()
        chosen = self.categories.resolve_from_enrichment(
            categories_raw=categories_raw,
            preferred_label=preferred,
        )
        enriched = {
            **result,
            "category": chosen.get("category") or result.get("category") or "",
            "category_label": chosen.get("category_label") or result.get("category_label") or "",
            "categories": chosen.get("categories") or categories_raw,
        }
        return self._fill_commerce_defaults(enriched)

    @staticmethod
    def _fill_commerce_defaults(result: dict[str, Any]) -> dict[str, Any]:
        """Fill GST/HSN/details when catalogs omit them so shop forms get usable values."""
        category_defaults: dict[str, tuple[str, str]] = {
            "pet-food": ("18", "23091000"),
            "pet_food": ("18", "23091000"),
            "pet-supplies": ("18", "39269099"),
            "pet_supplies": ("18", "39269099"),
            "food-grocery": ("5", "21069099"),
            "food_grocery": ("5", "21069099"),
            "beverages": ("12", "22021090"),
            "snacks": ("12", "21069099"),
            "dairy": ("5", "0401"),
            "personal-care": ("18", "33049990"),
            "personal_care": ("18", "33049990"),
            "household": ("18", "34029099"),
            "baby-care": ("12", "96190010"),
            "baby_care": ("12", "96190010"),
            "health": ("12", "30049099"),
        }
        category = str(result.get("category") or "").strip()
        default_gst, default_hsn = category_defaults.get(category, ("", ""))

        gst_raw = str(result.get("gst_rate") or "").strip()
        if not gst_raw or gst_raw in {"0", "0.0", "0.00"}:
            if default_gst:
                result["gst_rate"] = default_gst

        hsn = str(result.get("hsn_sac") or result.get("hsn") or "").strip()
        if not hsn and default_hsn:
            result["hsn_sac"] = default_hsn

        details = str(result.get("details_html") or "").strip()
        description = str(result.get("description") or "").strip()
        if not details and description:
            safe = (
                description.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
            result["details_html"] = f"<p>{safe}</p>"

        has_image = bool(
            str(result.get("image_url") or "").strip()
            or str(result.get("front_image_url") or "").strip()
            or str(result.get("local_image_url") or "").strip()
            or (
                isinstance(result.get("images"), dict)
                and (
                    str((result.get("images") or {}).get("front") or "").strip()
                    or any(
                        str(item or "").strip()
                        for item in ((result.get("images") or {}).get("gallery") or [])
                    )
                )
            )
        )
        if result.get("found") and not has_image:
            message = str(result.get("message") or "").strip()
            hint = "Add a pack photo so the product image is saved with this item."
            if hint.lower() not in message.lower():
                result["message"] = f"{message} {hint}".strip() if message else hint

        return result

    def _from_platform_gtin(self, code: str) -> dict[str, Any] | None:
        row = PlatformGtinCatalog.objects.filter(code=code).first()
        if not row:
            return None
        images = row.images if isinstance(row.images, dict) else {}
        gallery = images.get("gallery") if isinstance(images.get("gallery"), list) else []
        payload = {
            "found": True,
            "code": row.code,
            "source": "platform_gtin",
            "sku": row.code,
            "name": row.name,
            "brand": row.brand,
            "pack_size": row.pack_size,
            "serving_size": row.serving_size,
            "description": row.description,
            "details_html": row.details_html,
            "categories": row.categories,
            "category": row.category,
            "category_label": row.category_label or self.categories.label_for(row.category),
            "hsn_sac": row.hsn_sac,
            "gst_rate": str(row.gst_rate),
            "mrp": str(row.mrp),
            "image_url": row.image_url,
            "front_image_url": str(images.get("front") or row.image_url or ""),
            "back_image_url": str(images.get("back") or ""),
            "images": {
                "front": str(images.get("front") or row.image_url or ""),
                "back": str(images.get("back") or ""),
                "gallery": [str(item) for item in gallery if item][:5],
            },
            "confidence": row.confidence or "high",
            "needs_pack_photo": False,
            "message": "Filled from our product catalog. Review price and stock, then save.",
            "metadata": {
                "enrichment_source": "platform_gtin",
                "original_source": row.source,
            },
        }
        return self._fill_commerce_defaults(payload)

    def _upsert_platform_gtin(self, result: dict[str, Any]) -> None:
        code = self._normalize_code(str(result.get("code") or ""))
        if not code or not result.get("found"):
            return
        images = result.get("images") if isinstance(result.get("images"), dict) else {}
        gallery = images.get("gallery") if isinstance(images.get("gallery"), list) else []
        if not gallery:
            gallery = [
                str(result.get("front_image_url") or result.get("image_url") or "").strip(),
                str(result.get("back_image_url") or "").strip(),
            ]
            gallery = [item for item in gallery if item]

        try:
            mrp = Decimal(str(result.get("mrp") or "0") or "0")
        except (InvalidOperation, ValueError):
            mrp = Decimal("0.00")
        try:
            gst = Decimal(str(result.get("gst_rate") or "0") or "0")
        except (InvalidOperation, ValueError):
            gst = Decimal("0.00")

        incoming_confidence = str(result.get("confidence") or "medium")
        confidence_rank = {"high": 3, "medium": 2, "low": 1, "none": 0}
        existing = PlatformGtinCatalog.objects.filter(code=code).first()
        if existing and confidence_rank.get(existing.confidence, 0) > confidence_rank.get(incoming_confidence, 0):
            # Keep higher-confidence row; still refresh empty image slots if helpful.
            if not existing.image_url and result.get("image_url"):
                existing.image_url = str(result.get("image_url") or "")[:1024]
                existing.save(update_fields=["image_url", "updated_at", "version"])
            return

        defaults = {
            "name": str(result.get("name") or "")[:200],
            "brand": str(result.get("brand") or "")[:120],
            "pack_size": str(result.get("pack_size") or "")[:80],
            "serving_size": str(result.get("serving_size") or "")[:80],
            "description": str(result.get("description") or "")[:5000],
            "details_html": str(result.get("details_html") or "")[:10000],
            "categories": str(result.get("categories") or "")[:500],
            "category": str(result.get("category") or "")[:64],
            "category_label": str(result.get("category_label") or "")[:120],
            "hsn_sac": str(result.get("hsn_sac") or "")[:16],
            "gst_rate": gst,
            "mrp": mrp,
            "image_url": str(result.get("image_url") or result.get("front_image_url") or "")[:1024],
            "images": {
                "front": str(images.get("front") or result.get("front_image_url") or result.get("image_url") or ""),
                "back": str(images.get("back") or result.get("back_image_url") or ""),
                "gallery": [str(item) for item in gallery if item][:5],
            },
            "source": str(result.get("source") or "")[:64],
            "confidence": incoming_confidence[:16],
            "payload": result,
        }
        # Shop shares never wipe a known MRP / image with blanks.
        if existing:
            if (not defaults["image_url"]) and existing.image_url:
                defaults["image_url"] = existing.image_url
                existing_images = existing.images if isinstance(existing.images, dict) else {}
                defaults["images"] = {
                    "front": str(existing_images.get("front") or existing.image_url or ""),
                    "back": str(existing_images.get("back") or ""),
                    "gallery": (
                        existing_images.get("gallery")
                        if isinstance(existing_images.get("gallery"), list)
                        else ([existing.image_url] if existing.image_url else [])
                    )[:5],
                }
            if mrp <= 0 and existing.mrp and existing.mrp > 0:
                defaults["mrp"] = existing.mrp
            if (not defaults["hsn_sac"]) and existing.hsn_sac:
                defaults["hsn_sac"] = existing.hsn_sac
            if gst <= 0 and existing.gst_rate and existing.gst_rate > 0:
                defaults["gst_rate"] = existing.gst_rate
        PlatformGtinCatalog.objects.update_or_create(code=code, defaults=defaults)
