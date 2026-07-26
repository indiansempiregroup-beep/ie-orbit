from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from django.core.cache import cache

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60 * 60 * 24 * 7
USER_AGENT = "IE-Platform-ShopIE/1.0 (product enrichment)"
BARCODE_RE = re.compile(r"\b(\d{8}|\d{12,14})\b")

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
    """Barcode-first enrichment across Open*Facts catalogs (food + pet food)."""

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
    )

    def enrich(self, *, code: str = "", query: str = "", prefer_pet: bool = False) -> dict[str, Any]:
        normalized_code = self._normalize_code(code)
        search_query = (query or "").strip()

        if normalized_code:
            cache_key = f"shopie:enrich:v2:code:{normalized_code}"
            cached = cache.get(cache_key)
            if isinstance(cached, dict):
                return cached
            result = self._fetch_by_barcode(normalized_code, prefer_pet=prefer_pet)
            cache.set(cache_key, result, CACHE_TTL_SECONDS)
            return result

        if search_query:
            prefer_pet = prefer_pet or self.looks_like_pet_query(search_query)
            cache_key = f"shopie:enrich:v2:query:{prefer_pet}:{search_query.lower()}"
            cached = cache.get(cache_key)
            if isinstance(cached, dict):
                return cached
            result = self._search(search_query, prefer_pet=prefer_pet)
            cache.set(cache_key, result, CACHE_TTL_SECONDS)
            return result

        return {"found": False, "code": code or "", "source": None}

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
                }

        if hint:
            result = self.enrich(query=hint, prefer_pet=prefer_pet)
            if result.get("found"):
                return {
                    **result,
                    "image_url": image_url or result.get("image_url") or "",
                    "local_image_url": image_url,
                }

        return {
            "found": False,
            "code": barcode_candidates[0] if barcode_candidates else "",
            "source": "image_hint",
            "image_url": image_url,
            "local_image_url": image_url,
            "message": "Photo saved. Scan the barcode or enter the product name to look up details.",
        }

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
        # Reject obvious non-GTIN sequences like repeated years / phone-like noise.
        if digits.startswith("0000") or digits.endswith("000000"):
            return False
        return ProductEnrichmentService._gtin_checksum_ok(digits)

    @staticmethod
    def _gtin_checksum_ok(digits: str) -> bool:
        """Validate GTIN-8/12/13/14 check digit when length supports it."""
        if len(digits) not in {8, 12, 13, 14}:
            return False
        body, check = digits[:-1], int(digits[-1])
        total = 0
        # Right-to-left alternating 3/1 weights (GS1).
        for index, char in enumerate(reversed(body)):
            weight = 3 if index % 2 == 0 else 1
            total += int(char) * weight
        return (10 - (total % 10)) % 10 == check

    def _normalize_code(self, code: str) -> str:
        return "".join(ch for ch in (code or "").strip() if ch.isalnum())

    def _catalogs(self, *, prefer_pet: bool) -> tuple[dict[str, str], ...]:
        if prefer_pet:
            return self.CATALOGS
        # Food-first, then pet, then generic products.
        return (self.CATALOGS[1], self.CATALOGS[0], self.CATALOGS[2])

    def _http_get_json(self, url: str) -> dict[str, Any] | None:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
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
        image = (
            product.get("image_front_url")
            or product.get("image_url")
            or product.get("image_small_url")
            or ""
        )
        description = (
            product.get("generic_name")
            or product.get("ingredients_text")
            or product.get("ingredients_text_en")
            or ""
        )
        categories = product.get("categories") or ""
        if isinstance(categories, list):
            categories = ", ".join(str(item) for item in categories if item)

        return {
            "found": True,
            "code": str(code or product.get("code") or "").strip(),
            "source": source,
            "sku": str(code or product.get("code") or "").strip(),
            "name": str(name).strip(),
            "brand": str(brand).split(",")[0].strip() if brand else "",
            "pack_size": str(quantity).strip(),
            "serving_size": str(serving).strip(),
            "image_url": str(image).strip(),
            "description": str(description).strip()[:2000],
            "categories": str(categories).strip()[:500],
            "confidence": "high" if source.endswith("_barcode") or "product" in source else "medium",
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
        # v3 style
        status = payload.get("status")
        if isinstance(status, str) and status.lower() in {"success", "found"}:
            return True
        return bool(payload.get("product"))

    def _fetch_by_barcode(self, code: str, *, prefer_pet: bool) -> dict[str, Any]:
        for catalog in self._catalogs(prefer_pet=prefer_pet):
            url = catalog["product_url"].format(code=code)
            payload = self._http_get_json(url)
            if not payload:
                continue
            if not self._product_status_ok(payload):
                continue
            product = payload.get("product") or {}
            if not product:
                continue
            mapped = self._map_product(
                code=code,
                product=product,
                source=f"{catalog['name']}_barcode",
            )
            mapped["confidence"] = "high"
            return mapped
        return {"found": False, "code": code, "source": "barcode_lookup", "confidence": "none"}

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
        return {"found": False, "code": "", "source": "catalog_search", "query": query, "confidence": "none"}

    def _search_catalog(self, catalog: dict[str, str], query: str) -> dict[str, Any] | None:
        # Prefer Search-a-licious style when available.
        if catalog.get("search_url") and "search.openfoodfacts.org" in catalog["search_url"]:
            params = urllib.parse.urlencode(
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

        # cgi/search for pet food facts
        if catalog.get("search_url") and "cgi/search.pl" in catalog["search_url"]:
            params = urllib.parse.urlencode(
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
            fallback_params = urllib.parse.urlencode(
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
