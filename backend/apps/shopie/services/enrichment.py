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
    lookup_datakick_barcode,
    lookup_public_barcode,
)
from apps.shopie.services.catalog_import.normalize import (
    build_product_details,
    collect_images,
    distinct_product_details,
    infer_pack_size,
    pack_size_from_parts,
)
from apps.shopie.services.categories import CategoryService
from apps.shopie.services.openmrp import lookup_openmrp_barcode

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
        """Ensure API payloads expose a shop-owner-friendly message (never raw source keys).

        Success copy always states whether the fill was free or deducted from Smart Fill wallet.
        """
        if not isinstance(result, dict):
            return result

        source = str(result.get("source") or "").strip()
        found = bool(result.get("found"))
        charged_paise = 0
        try:
            charged_paise = max(0, int(result.get("charged_paise") or 0))
        except (TypeError, ValueError):
            charged_paise = 0

        free_note = " Free — no wallet charge."
        if charged_paise > 0:
            billing_note = f" ₹{charged_paise / 100:.2f} deducted from Smart Fill wallet."
        else:
            billing_note = ""

        existing = str(result.get("message") or "").strip()
        # Keep carefully written miss / error messages that already explain next steps,
        # unless this was a paid Smart hit that still needs the debit called out.
        keep_existing = bool(
            existing
            and not found
            and charged_paise <= 0
            and "platform_gtin" not in existing
            and "_barcode" not in existing
            and not any(
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
                    "openmrp",
                    "datakick",
                    "public_go_upc",
                )
            )
        )
        if keep_existing:
            return result

        if source == "shop_catalog":
            name = str(result.get("existing_product_name") or result.get("name") or "this product").strip()
            message = f"Already in your catalog as {name}."
        elif source == "platform_gtin":
            message = (
                f"Filled from our product catalog.{free_note} Review price and stock, then save."
                if found
                else "No catalog match for this barcode."
            )
        elif source == "shop_shared":
            message = (
                f"Filled from products shared by shops on the platform.{free_note} "
                "Review price and stock, then save."
                if found
                else "No shared catalog match for this barcode."
            )
        elif source == "openmrp":
            message = (
                f"Filled from the India product registry.{free_note} Review price and stock, then save."
                if found
                else "No match in the India product registry."
            )
        elif source == "datakick":
            message = (
                f"Filled from an open product database.{free_note} Review details, then save."
                if found
                else "No match in the open product database."
            )
        elif source.startswith("commercial_") or source == "public_go_upc":
            message = (
                f"Filled from an online product database.{free_note} Review price and stock, then save."
                if found
                else "No match from the online product database."
            )
        elif source == "gemini_vision":
            if found and charged_paise > 0:
                message = f"Filled from pack photo.{billing_note} Review carefully, then save."
            elif found:
                message = f"Filled from pack photo. No wallet charge. Review carefully, then save."
            else:
                message = existing or "Could not read the pack photo clearly. Try again or fill details manually."
        elif source == "gemini_text":
            if found:
                billing = billing_note if charged_paise > 0 else " No wallet charge."
                if result.get("needs_pack_photo"):
                    message = (
                        f"Possible match from Smart lookup (not verified).{billing} "
                        "Review carefully, or capture a pack photo to confirm."
                    )
                else:
                    message = (
                        f"Filled by Smart lookup.{billing} "
                        "Review carefully — a pack photo improves accuracy."
                    )
            else:
                message = (
                    existing
                    or "Smart lookup could not identify this barcode. Take a pack photo or enter details manually."
                )
        elif source.endswith("_barcode") or source.startswith("open_"):
            message = (
                f"Filled from an online product database.{free_note} Review price and stock, then save."
                if found
                else "No online match for this barcode — take a pack photo or fill details manually."
            )
        elif source == "barcode_lookup":
            message = "No online match for this barcode — take a pack photo or fill details manually."
        elif source == "image_hint":
            message = "Photo saved. Scan the barcode or enter the product name to look up details."
        elif found and charged_paise > 0:
            message = f"Product details filled.{billing_note} Review price and stock, then save."
        elif found:
            message = f"Product details filled.{free_note} Review price and stock, then save."
        else:
            message = existing or "No match yet. Take a pack photo or enter details manually."

        result["message"] = message
        return result

    def enrich(self, *, code: str = "", query: str = "", prefer_pet: bool = False) -> dict[str, Any]:
        normalized_code = self._normalize_code(code)
        search_query = (query or "").strip()

        if normalized_code:
            variants = gtin_variants(normalized_code) or [normalized_code]
            cached: dict[str, Any] | None = None
            for variant in variants:
                cached = self._from_platform_gtin(variant)
                if cached:
                    break

            if cached and not self._needs_commerce_gap_fill(cached):
                cached["code"] = normalized_code
                cached["sku"] = normalized_code
                return self.with_user_message(self._ensure_pack_size(cached))

            result: dict[str, Any] = (
                dict(cached)
                if cached
                else {"found": False, "code": normalized_code, "source": "barcode_lookup"}
            )
            result["code"] = normalized_code
            result["sku"] = normalized_code

            # Stage B: race free providers that still apply (same steps, overlapped).
            prefer = prefer_pet or any(self.looks_like_pet_query(v) for v in variants)
            result = self._merge_provider_hits(
                result,
                normalized_code,
                self._race_free_providers(
                    variants=variants,
                    normalized_code=normalized_code,
                    needs_mrp=self._needs_mrp(result),
                    needs_identity=not bool(result.get("found")),
                    prefer_pet=prefer,
                ),
            )

            # Stage C: commercial + public gap-fill in parallel when still incomplete.
            result = self._merge_provider_hits(
                result,
                normalized_code,
                self._race_gap_fill_providers(
                    normalized_code=normalized_code,
                    needs_identity=not bool(result.get("found")),
                    needs_mrp=self._needs_mrp(result),
                    needs_pack=self._needs_pack_size(result),
                ),
            )

            if result.get("found"):
                result = self._ensure_pack_size(result)
                result = self._attach_category(result)
                # Shop form may get category-suggested GST; do not invent GST into the master.
                self._upsert_platform_gtin(self._payload_for_platform_upsert(result))
            else:
                result.setdefault("needs_pack_photo", True)
                result.setdefault("confidence", "none")
            return self.with_user_message(result)

        if search_query:
            prefer_pet = prefer_pet or self.looks_like_pet_query(search_query)
            result = self._search(search_query, prefer_pet=prefer_pet)
            if result.get("found"):
                result = self._attach_category(result)
                if result.get("code"):
                    self._upsert_platform_gtin(self._payload_for_platform_upsert(result))
            return self.with_user_message(result)

        return self.with_user_message(
            {"found": False, "code": code or "", "source": None, "confidence": "none"}
        )

    def _race_free_providers(
        self,
        *,
        variants: list[str],
        normalized_code: str,
        needs_mrp: bool,
        needs_identity: bool,
        prefer_pet: bool,
    ) -> list[dict[str, Any]]:
        """OpenMRP + Open*Facts + Datakick concurrently; all still run when needed."""
        hits: list[dict[str, Any]] = []
        if not needs_mrp and not needs_identity:
            return hits

        with ThreadPoolExecutor(max_workers=3) as pool:
            futures: dict[Any, str] = {}
            if needs_mrp:
                futures[pool.submit(self._lookup_openmrp_any, variants)] = "openmrp"
            if needs_identity:
                futures[pool.submit(self._lookup_openfacts_any, variants, prefer_pet)] = "openfacts"
                futures[pool.submit(lookup_datakick_barcode, normalized_code)] = "datakick"
            for future in as_completed(futures):
                label = futures[future]
                try:
                    hit = future.result()
                except Exception as exc:  # noqa: BLE001 — keep other providers
                    logger.info("Free enrich provider %s failed: %s", label, exc)
                    continue
                if hit and hit.get("found") and hit.get("name"):
                    hits.append(hit)
        return hits

    def _race_gap_fill_providers(
        self,
        *,
        normalized_code: str,
        needs_identity: bool,
        needs_mrp: bool,
        needs_pack: bool,
    ) -> list[dict[str, Any]]:
        """Commercial + public Go-UPC concurrently for remaining gaps."""
        hits: list[dict[str, Any]] = []
        want_commercial = (needs_identity or needs_mrp) and barcode_api_configured()
        want_public = needs_identity or needs_pack
        if not want_commercial and not want_public:
            return hits

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures: dict[Any, str] = {}
            if want_commercial:
                futures[pool.submit(lookup_commercial_barcode, normalized_code)] = "commercial"
            if want_public:
                futures[pool.submit(lookup_public_barcode, normalized_code)] = "public"
            for future in as_completed(futures):
                label = futures[future]
                try:
                    hit = future.result()
                except Exception as exc:  # noqa: BLE001 — keep other providers
                    logger.info("Gap-fill enrich provider %s failed: %s", label, exc)
                    continue
                if hit and hit.get("found") and hit.get("name"):
                    hits.append(hit)
        return hits

    def _lookup_openmrp_any(self, variants: list[str]) -> dict[str, Any] | None:
        """Race GTIN variants against OpenMRP; first hit wins."""
        if not variants:
            return None
        if len(variants) == 1:
            return lookup_openmrp_barcode(variants[0])

        with ThreadPoolExecutor(max_workers=min(4, len(variants))) as pool:
            futures = [pool.submit(lookup_openmrp_barcode, variant) for variant in variants]
            for future in as_completed(futures):
                try:
                    hit = future.result()
                except Exception as exc:  # noqa: BLE001
                    logger.info("OpenMRP variant race failed: %s", exc)
                    continue
                if hit and hit.get("found") and hit.get("name"):
                    for pending in futures:
                        pending.cancel()
                    return hit
        return None

    def _lookup_openfacts_any(self, variants: list[str], prefer_pet: bool) -> dict[str, Any] | None:
        """Race GTIN variants against Open*Facts catalogs; first hit wins."""
        if not variants:
            return None

        def _one(variant: str) -> dict[str, Any] | None:
            prefer = prefer_pet or self.looks_like_pet_query(variant)
            hit = self._fetch_by_barcode(variant, prefer_pet=prefer)
            if hit.get("found"):
                return hit
            return None

        if len(variants) == 1:
            return _one(variants[0])

        with ThreadPoolExecutor(max_workers=min(4, len(variants))) as pool:
            futures = [pool.submit(_one, variant) for variant in variants]
            for future in as_completed(futures):
                try:
                    hit = future.result()
                except Exception as exc:  # noqa: BLE001
                    logger.info("Open*Facts variant race failed: %s", exc)
                    continue
                if hit and hit.get("found"):
                    for pending in futures:
                        pending.cancel()
                    return hit
        return None

    @classmethod
    def _merge_provider_hits(
        cls,
        result: dict[str, Any],
        normalized_code: str,
        hits: list[dict[str, Any]],
    ) -> dict[str, Any]:
        # Identity catalogs first; OpenMRP / commercial last so MRP fills gaps.
        def _merge_rank(hit: dict[str, Any]) -> int:
            source = str(hit.get("source") or "")
            if source.startswith("openmrp") or source.startswith("commercial_"):
                return 2
            if source in {"datakick", "public_go_upc"}:
                return 1
            return 0

        for hit in sorted(hits, key=_merge_rank):
            hit = dict(hit)
            hit["code"] = normalized_code
            hit["sku"] = normalized_code
            result = cls._merge_enrichment(result, hit)
        return result

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

    @staticmethod
    def _payload_for_platform_upsert(result: dict[str, Any]) -> dict[str, Any]:
        """Copy enrich payload for master upsert; strip invented GST from open catalogs."""
        payload = dict(result)
        source = str(payload.get("source") or "")
        if source in {"openmrp", "open_food_facts", "public_go_upc", "datakick"} or source.startswith(
            "open_"
        ):
            payload["gst_rate"] = None
        return payload

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
        quantity = pack_size_from_parts(
            label=str(product.get("quantity") or ""),
            size=product.get("product_quantity"),
            unit=str(product.get("product_quantity_unit") or ""),
        )
        if not quantity and product.get("product_quantity") not in (None, "", 0, "0"):
            quantity = str(product.get("product_quantity")).strip()
        serving = product.get("serving_size") or ""
        quantity = infer_pack_size(
            pack_size=str(quantity or ""),
            serving_size=str(serving or ""),
            name=str(name or ""),
            quantity=str(product.get("quantity") or ""),
        )
        front = (
            product.get("image_front_url")
            or product.get("image_url")
            or product.get("image_small_url")
            or ""
        )
        back = product.get("image_packaging_url") or product.get("image_ingredients_url") or ""
        gallery = collect_images(
            front,
            back,
            product.get("image_nutrition_url"),
            product.get("image_ingredients_url"),
            product.get("image_packaging_url"),
            product.get("image_front_large_url"),
        )

        ingredients = (
            product.get("ingredients_text")
            or product.get("ingredients_text_en")
            or ""
        )
        description = ingredients or product.get("generic_name") or ""
        categories = product.get("categories") or ""
        if isinstance(categories, list):
            categories = ", ".join(str(item) for item in categories if item)
        labels = product.get("labels") or ""
        if isinstance(labels, list):
            labels = ", ".join(str(item) for item in labels if item)
        allergens = product.get("allergens") or product.get("allergens_from_ingredients") or ""
        details = build_product_details(
            str(labels),
            f"Allergens: {allergens}" if allergens else "",
            str(serving),
            str(categories).split(",")[0].strip() if categories else "",
        )

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

        countries = str(product.get("countries") or "").lower()
        currency = "INR" if "india" in countries else ""

        return {
            "found": True,
            "code": str(code or product.get("code") or "").strip(),
            "source": source,
            "sku": str(code or product.get("code") or "").strip(),
            "name": str(name).strip(),
            "brand": str(brand).split(",")[0].strip() if brand else "",
            "pack_size": str(quantity).strip(),
            "serving_size": str(serving).strip(),
            "image_url": gallery[0] if gallery else str(front).strip(),
            "front_image_url": gallery[0] if gallery else str(front).strip(),
            "back_image_url": gallery[1] if len(gallery) > 1 else str(back).strip(),
            "images": {
                "front": gallery[0] if gallery else str(front).strip(),
                "back": gallery[1] if len(gallery) > 1 else str(back).strip(),
                "gallery": gallery,
            },
            "description": str(description).strip()[:5000],
            "details_html": details,
            "categories": str(categories).strip()[:500],
            "mrp": str(mrp),
            "currency": currency,
            "hsn_sac": "",
            "gst_rate": None,
            "confidence": "high" if source.endswith("_barcode") or "product" in source else "medium",
            "needs_pack_photo": len(gallery) == 0,
            "metadata": {
                "enrichment_source": source,
                "categories": str(categories).strip()[:500],
                "serving_size": str(serving).strip(),
                "quantity": str(quantity).strip(),
                "labels": str(labels).strip()[:300],
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

    @classmethod
    def _mrp_value(cls, payload: dict[str, Any]) -> Decimal:
        try:
            return Decimal(str(payload.get("mrp") or "0") or "0")
        except (InvalidOperation, ValueError):
            return Decimal("0.00")

    @classmethod
    def _needs_mrp(cls, payload: dict[str, Any]) -> bool:
        return cls._mrp_value(payload) <= 0

    @classmethod
    def _needs_pack_size(cls, payload: dict[str, Any]) -> bool:
        pack = str(payload.get("pack_size") or "").strip()
        if not pack:
            return True
        # Digits-only packs are incomplete (OFF often stores quantity without unit).
        return not re.search(r"[A-Za-z]", pack)

    @classmethod
    def _needs_commerce_gap_fill(cls, payload: dict[str, Any]) -> bool:
        return cls._needs_mrp(payload) or cls._needs_pack_size(payload)

    @classmethod
    def _ensure_pack_size(cls, result: dict[str, Any]) -> dict[str, Any]:
        metadata = result.get("metadata") if isinstance(result.get("metadata"), dict) else {}
        pack = infer_pack_size(
            pack_size=str(result.get("pack_size") or ""),
            serving_size=str(result.get("serving_size") or ""),
            name=str(result.get("name") or ""),
            quantity=str(metadata.get("quantity") or ""),
        )
        if pack:
            result["pack_size"] = pack[:80]
        return result

    @classmethod
    def _merge_enrichment(cls, base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
        """Merge provider hits without wiping known pack/MRP/name with empties."""
        if not incoming or not incoming.get("found"):
            return base
        if not base.get("found"):
            merged = dict(incoming)
            return cls._ensure_pack_size(merged)

        out = dict(base)
        for key in (
            "name",
            "brand",
            "description",
            "details_html",
            "categories",
            "category",
            "category_label",
            "hsn_sac",
            "currency",
            "image_url",
            "front_image_url",
            "back_image_url",
            "serving_size",
            "confidence",
            "message",
        ):
            if not str(out.get(key) or "").strip() and str(incoming.get(key) or "").strip():
                out[key] = incoming[key]

        in_pack = str(incoming.get("pack_size") or "").strip()
        out_pack = str(out.get("pack_size") or "").strip()
        if in_pack and (not out_pack or (cls._needs_pack_size(out) and not cls._needs_pack_size(incoming))):
            out["pack_size"] = in_pack

        if cls._needs_mrp(out) and not cls._needs_mrp(incoming):
            out["mrp"] = str(incoming.get("mrp") or "")
            if incoming.get("currency"):
                out["currency"] = incoming.get("currency")
            # Prefer the provider that supplied a real MRP for provenance.
            if incoming.get("source"):
                out["source"] = incoming.get("source")

        in_images = incoming.get("images") if isinstance(incoming.get("images"), dict) else {}
        out_images = out.get("images") if isinstance(out.get("images"), dict) else {}
        gallery = collect_images(
            out.get("image_url"),
            out.get("front_image_url"),
            out_images.get("front"),
            out_images.get("gallery"),
            incoming.get("image_url"),
            incoming.get("front_image_url"),
            in_images.get("front"),
            in_images.get("gallery"),
            out.get("back_image_url"),
            incoming.get("back_image_url"),
        )
        if gallery:
            out["image_url"] = gallery[0]
            out["front_image_url"] = gallery[0]
            out["back_image_url"] = gallery[1] if len(gallery) > 1 else str(out.get("back_image_url") or "")
            out["images"] = {
                "front": gallery[0],
                "back": gallery[1] if len(gallery) > 1 else "",
                "gallery": gallery[:5],
            }

        meta_base = out.get("metadata") if isinstance(out.get("metadata"), dict) else {}
        meta_in = incoming.get("metadata") if isinstance(incoming.get("metadata"), dict) else {}
        if meta_base or meta_in:
            out["metadata"] = {**meta_base, **meta_in}

        out["found"] = True
        return cls._ensure_pack_size(out)

    def _fill_commerce_defaults(self, result: dict[str, Any]) -> dict[str, Any]:
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

        # Keep description (ingredients) and product details (attributes) distinct.
        # Never copy description into details_html — that made both fields look identical.
        description = str(result.get("description") or "").strip()
        details = distinct_product_details(description, str(result.get("details_html") or ""))
        result["details_html"] = details
        result = self._ensure_pack_size(result)

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
            "gst_rate": str(row.gst_rate) if row.gst_rate is not None else None,
            "mrp": str(row.mrp),
            "currency": row.currency or "",
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
        gst_raw = result.get("gst_rate")
        gst: Decimal | None
        if gst_raw in (None, "", "null"):
            gst = None
        else:
            try:
                gst = Decimal(str(gst_raw))
                if gst <= 0:
                    gst = None
            except (InvalidOperation, ValueError):
                gst = None

        gallery_urls = collect_images(
            result.get("image_url"),
            result.get("front_image_url"),
            result.get("back_image_url"),
            gallery,
            images.get("front"),
            images.get("back"),
        )

        incoming_confidence = str(result.get("confidence") or "medium")
        confidence_rank = {"high": 3, "medium": 2, "low": 1, "none": 0}
        existing = PlatformGtinCatalog.objects.filter(code=code).first()
        if existing and confidence_rank.get(existing.confidence, 0) > confidence_rank.get(incoming_confidence, 0):
            # Keep higher-confidence row; still refresh empty image slots if helpful.
            if not existing.image_url and gallery_urls:
                existing.image_url = gallery_urls[0][:1024]
                existing_images = existing.images if isinstance(existing.images, dict) else {}
                existing.images = {
                    "front": gallery_urls[0],
                    "back": gallery_urls[1] if len(gallery_urls) > 1 else str(existing_images.get("back") or ""),
                    "gallery": gallery_urls[:5],
                }
                existing.save(update_fields=["image_url", "images", "updated_at", "version"])
            return

        defaults = {
            "name": str(result.get("name") or "")[:200],
            "brand": str(result.get("brand") or "")[:120],
            "pack_size": str(result.get("pack_size") or "")[:80],
            "serving_size": str(result.get("serving_size") or "")[:80],
            "description": str(result.get("description") or "")[:5000],
            "details_html": distinct_product_details(
                str(result.get("description") or ""),
                str(result.get("details_html") or ""),
            )[:10000],
            "categories": str(result.get("categories") or "")[:500],
            "category": str(result.get("category") or "")[:64],
            "category_label": str(result.get("category_label") or "")[:120],
            "hsn_sac": str(result.get("hsn_sac") or "")[:16],
            "gst_rate": gst,
            "mrp": mrp,
            "currency": str(result.get("currency") or "")[:3],
            "image_url": (gallery_urls[0] if gallery_urls else "")[:1024],
            "images": {
                "front": gallery_urls[0] if gallery_urls else "",
                "back": gallery_urls[1] if len(gallery_urls) > 1 else "",
                "gallery": gallery_urls[:5],
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
            if (not defaults["pack_size"]) and existing.pack_size:
                defaults["pack_size"] = existing.pack_size
            elif existing.pack_size and not re.search(r"[A-Za-z]", defaults["pack_size"] or "") and re.search(
                r"[A-Za-z]", existing.pack_size
            ):
                defaults["pack_size"] = existing.pack_size
            if (not defaults["hsn_sac"]) and existing.hsn_sac:
                defaults["hsn_sac"] = existing.hsn_sac
            if gst is None and existing.gst_rate is not None:
                defaults["gst_rate"] = existing.gst_rate
            if (not defaults["currency"]) and existing.currency:
                defaults["currency"] = existing.currency
            if (not defaults["description"]) and existing.description:
                defaults["description"] = existing.description
            if (not defaults["details_html"]) and existing.details_html:
                defaults["details_html"] = existing.details_html
        PlatformGtinCatalog.objects.update_or_create(code=code, defaults=defaults)
