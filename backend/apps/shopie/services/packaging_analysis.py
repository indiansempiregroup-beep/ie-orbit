from __future__ import annotations

import io
import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.cache import cache

from apps.common.utils.urls import normalize_stored_asset_url
from apps.shopie.services.enrichment import BARCODE_RE, PET_BRAND_HINTS, ProductEnrichmentService

logger = logging.getLogger(__name__)

JOB_TTL_SECONDS = 60 * 30
USER_AGENT = "IE-Orbit-ShopIE/1.0 (packaging analysis)"
QUANTITY_RE = re.compile(
    r"\b(\d+(?:[.,]\d+)?\s?(?:ml|mL|ML|l|L|g|G|kg|KG|pcs|pack|x\s?\d+))\b",
    re.IGNORECASE,
)
INGREDIENTS_RE = re.compile(
    r"(?:ingredients?|ingredient list|composition|analytical constituents)\s*[:\-]?\s*(.+)",
    re.IGNORECASE | re.DOTALL,
)
NOISE_LINE_RE = re.compile(
    r"^(net\s*wt|mrp|pkd|best before|use by|exp|batch|fssai|lic|customer care|www\.|http)",
    re.IGNORECASE,
)


class PackagingAnalysisService:
    """Analyse front/back packaging photos with barcode-first, catalog-aware enrichment."""

    enrichment = ProductEnrichmentService()

    def start_job(
        self,
        *,
        front_image_url: str,
        back_image_url: str = "",
        hint: str = "",
    ) -> str:
        job_id = str(uuid.uuid4())
        self._set_job(
            job_id,
            {
                "status": "queued",
                "front_image_url": front_image_url,
                "back_image_url": back_image_url,
                "hint": hint,
                "result": None,
                "error": None,
            },
        )
        return job_id

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        payload = cache.get(self._cache_key(job_id))
        return payload if isinstance(payload, dict) else None

    def run_job(
        self,
        *,
        job_id: str,
        front_image_url: str,
        back_image_url: str = "",
        hint: str = "",
    ) -> dict[str, Any]:
        self._set_job(
            job_id,
            {
                "status": "running",
                "front_image_url": front_image_url,
                "back_image_url": back_image_url,
                "hint": hint,
                "result": None,
                "error": None,
            },
        )
        try:
            result = self.analyze(
                front_image_url=front_image_url,
                back_image_url=back_image_url,
                hint=hint,
            )
            job = {
                "status": "done",
                "front_image_url": front_image_url,
                "back_image_url": back_image_url,
                "hint": hint,
                "result": result,
                "error": None,
            }
            self._set_job(job_id, job)
            return job
        except Exception as exc:  # noqa: BLE001 - surface analysis failures to clients
            logger.exception("Packaging analysis failed for job %s", job_id)
            job = {
                "status": "failed",
                "front_image_url": front_image_url,
                "back_image_url": back_image_url,
                "hint": hint,
                "result": None,
                "error": str(exc),
            }
            self._set_job(job_id, job)
            return job

    def analyze(
        self,
        *,
        front_image_url: str,
        back_image_url: str = "",
        hint: str = "",
    ) -> dict[str, Any]:
        front_image_url = (front_image_url or "").strip()
        back_image_url = (back_image_url or "").strip()
        hint = (hint or "").strip()
        if not front_image_url and not back_image_url:
            raise ValueError("Provide at least one packaging image URL.")

        sides: list[tuple[str, str]] = []
        if front_image_url:
            sides.append(("front", front_image_url))
        if back_image_url:
            sides.append(("back", back_image_url))

        barcodes: list[str] = []
        ocr_by_side: dict[str, str] = {}
        tools_used: list[str] = []

        # Prefer back image first for barcode decode (GTIN usually on back).
        ordered_sides = sorted(sides, key=lambda item: 0 if item[0] == "back" else 1)

        for side, url in ordered_sides:
            image_bytes = self._load_image_bytes(url)
            decoded = self._decode_barcodes(image_bytes)
            if decoded:
                tools_used.append("pyzbar")
                barcodes.extend(decoded)
            text = self._ocr_image(url=url, image_bytes=image_bytes)
            if text:
                if "ocr" not in tools_used:
                    tools_used.append("ocr")
                ocr_by_side[side] = text
                barcodes.extend(BARCODE_RE.findall(text))

        if hint:
            barcodes.extend(BARCODE_RE.findall(hint))

        unique_barcodes = self._unique_plausible_barcodes(barcodes)
        front_text = ocr_by_side.get("front", "")
        back_text = ocr_by_side.get("back", "")
        combined_text = "\n".join(part for part in [front_text, back_text, hint] if part)
        prefer_pet = ProductEnrichmentService.looks_like_pet_query(combined_text)

        parsed = self._parse_packaging_text(front_text=front_text, back_text=back_text, hint=hint)
        if prefer_pet and not parsed.get("brand"):
            for brand in PET_BRAND_HINTS:
                if brand in combined_text.lower():
                    parsed["brand"] = brand.title()
                    break

        catalog: dict[str, Any] | None = None
        match_method = "none"

        # 1) Barcode wins — highest trust.
        for code in unique_barcodes:
            candidate = self.enrichment.enrich(code=code, prefer_pet=prefer_pet)
            if candidate.get("found"):
                catalog = candidate
                match_method = "barcode"
                tools_used.append(str(candidate.get("source") or "catalog_barcode"))
                break

        # 2) Cautious text search only when barcode miss + OCR/hint looks trustworthy.
        if catalog is None:
            search_query = self._build_search_query(parsed=parsed, hint=hint, combined_text=combined_text)
            if search_query:
                candidate = self.enrichment.enrich(query=search_query, prefer_pet=prefer_pet)
                if candidate.get("found") and self._catalog_matches_packaging(candidate, combined_text, hint):
                    catalog = candidate
                    match_method = "search"
                    tools_used.append(str(candidate.get("source") or "catalog_search"))

        result = self._merge_result(
            catalog=catalog,
            parsed=parsed,
            unique_barcodes=unique_barcodes,
            front_image_url=front_image_url,
            back_image_url=back_image_url,
            front_text=front_text,
            back_text=back_text,
            combined_text=combined_text,
            tools_used=tools_used,
            match_method=match_method,
            prefer_pet=prefer_pet,
        )
        return result

    def _merge_result(
        self,
        *,
        catalog: dict[str, Any] | None,
        parsed: dict[str, str],
        unique_barcodes: list[str],
        front_image_url: str,
        back_image_url: str,
        front_text: str,
        back_text: str,
        combined_text: str,
        tools_used: list[str],
        match_method: str,
        prefer_pet: bool,
    ) -> dict[str, Any]:
        confidence = "low"
        if match_method == "barcode":
            confidence = "high"
        elif match_method == "search":
            confidence = "medium"
        elif parsed.get("name") or parsed.get("brand"):
            confidence = "low"

        # Prefer OCR brand/name when catalog came from fuzzy search and disagrees.
        name = parsed.get("name") or ""
        brand = parsed.get("brand") or ""
        if catalog and catalog.get("found"):
            catalog_name = str(catalog.get("name") or "").strip()
            catalog_brand = str(catalog.get("brand") or "").strip()
            catalog_name_is_code = bool(
                catalog_name
                and (
                    BARCODE_RE.fullmatch(catalog_name.replace(" ", ""))
                    or catalog_name == str(catalog.get("code") or "")
                )
            )
            if match_method == "barcode":
                name = name if catalog_name_is_code and name else (catalog_name or name)
                brand = catalog_brand or brand
            else:
                name = catalog_name or name
                brand = catalog_brand or brand

        description = parsed.get("description") or (catalog or {}).get("description") or ""
        pack_size = (catalog or {}).get("pack_size") or parsed.get("pack_size") or ""
        if not description and combined_text:
            description = combined_text[:2000]

        result: dict[str, Any] = {
            "found": bool((catalog and catalog.get("found")) or name or brand or unique_barcodes),
            "source": "packaging_analysis",
            "tools": sorted(set(tools_used)),
            "code": (catalog or {}).get("code") or (unique_barcodes[0] if unique_barcodes else ""),
            "sku": (catalog or {}).get("sku") or (unique_barcodes[0] if unique_barcodes else ""),
            "name": name,
            "brand": brand,
            "description": description,
            "pack_size": pack_size,
            "serving_size": (catalog or {}).get("serving_size") or "",
            "categories": (catalog or {}).get("categories") or ("Pet food" if prefer_pet else ""),
            "image_url": front_image_url or (catalog or {}).get("image_url") or "",
            "local_image_url": front_image_url,
            "front_image_url": front_image_url,
            "back_image_url": back_image_url,
            "barcode_candidates": unique_barcodes,
            "confidence": confidence,
            "match_method": match_method,
            "ocr_excerpt": {
                "front": front_text[:500],
                "back": back_text[:500],
            },
            "metadata": {
                "enrichment_source": "packaging_analysis",
                "match_method": match_method,
                "confidence": confidence,
                "prefer_pet": prefer_pet,
                "images": {
                    "front": front_image_url,
                    "back": back_image_url,
                },
                "barcode_candidates": unique_barcodes,
                "categories": (catalog or {}).get("categories") or "",
            },
            "message": None,
        }

        if confidence == "high":
            result["message"] = (
                "Matched by barcode in online catalog. Review price/stock, then save."
            )
        elif confidence == "medium":
            result["message"] = (
                "Possible catalog match from packaging text. Please verify name/brand before saving."
            )
        elif result["found"]:
            result["message"] = (
                "Filled from packaging text only (no confident catalog match). "
                "Scan the barcode for a better match."
            )
        else:
            result["message"] = (
                "Photos saved, but we could not identify the product confidently. "
                "Scan the barcode on the pack, or type the product name."
            )
        return result

    def _build_search_query(self, *, parsed: dict[str, str], hint: str, combined_text: str) -> str:
        if hint.strip():
            return hint.strip()
        brand = (parsed.get("brand") or "").strip()
        name = (parsed.get("name") or "").strip()
        if brand and name and brand.lower() not in name.lower():
            return f"{brand} {name}".strip()
        if name:
            return name
        if brand:
            return brand
        # Last resort: known brand token from OCR body.
        lowered = combined_text.lower()
        for token in PET_BRAND_HINTS:
            if token in lowered:
                return token
        return ""

    def _catalog_matches_packaging(
        self,
        catalog: dict[str, Any],
        combined_text: str,
        hint: str,
    ) -> bool:
        haystack = f"{combined_text} {hint}".lower()
        tokens = set()
        for field in (catalog.get("brand"), catalog.get("name")):
            tokens.update(re.findall(r"[a-z0-9]+", str(field or "").lower()))
        meaningful = {token for token in tokens if len(token) > 2 and token not in {"the", "and", "for", "with"}}
        if not meaningful:
            return False
        overlap = sum(1 for token in meaningful if token in haystack)
        # Require at least one strong token overlap (e.g. pedigree).
        return overlap >= 1

    def _unique_plausible_barcodes(self, barcodes: list[str]) -> list[str]:
        unique: list[str] = []
        for code in sorted({self.enrichment._normalize_code(item) for item in barcodes}, key=lambda value: (-len(value), value)):
            if not self.enrichment.is_plausible_barcode(code):
                continue
            if code not in unique:
                unique.append(code)
        return unique

    def _cache_key(self, job_id: str) -> str:
        return f"shopie:packaging-job:{job_id}"

    def _set_job(self, job_id: str, payload: dict[str, Any]) -> None:
        cache.set(self._cache_key(job_id), payload, JOB_TTL_SECONDS)

    def _load_image_bytes(self, url: str) -> bytes | None:
        if not url:
            return None
        local = self._local_media_path(url)
        if local and local.exists():
            try:
                return local.read_bytes()
            except OSError as exc:
                logger.info("Unable to read local packaging image %s: %s", local, exc)

        stored = self._read_stored_media_bytes(url)
        if stored:
            return stored

        if url.startswith(("http://", "https://")):
            try:
                request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(request, timeout=15) as response:
                    return response.read()
            except (urllib.error.URLError, TimeoutError, ValueError) as exc:
                logger.info("Unable to download packaging image %s: %s", url, exc)
        return None

    def _read_stored_media_bytes(self, url: str) -> bytes | None:
        from apps.platform_media.models import Media
        from apps.platform_media.storage import get_storage_provider

        match = re.search(r"/api/v1/media/([0-9a-fA-F-]+)/file", url)
        try:
            if match:
                media = Media.objects.filter(id=match.group(1)).first()
                if media:
                    return get_storage_provider(media.storage_provider).read_bytes(
                        path=media.storage_path
                    )
            stored = normalize_stored_asset_url(url)
            if stored.startswith("/media/uploads/"):
                relative = stored[len("/media/uploads/") :]
                return get_storage_provider().read_bytes(path=relative)
        except Exception as exc:  # noqa: BLE001
            logger.info("Unable to read stored packaging image %s: %s", url, exc)
        return None

    def _local_media_path(self, url: str) -> Path | None:
        stored = normalize_stored_asset_url(url)
        if not stored:
            return None
        if not stored.startswith("/media/"):
            return None
        relative = stored.split("/media/uploads/", 1)[-1] if "/media/uploads/" in stored else ""
        if not relative and stored.startswith("/media/uploads/"):
            relative = stored[len("/media/uploads/") :]
        if not relative:
            if stored.startswith("/media/"):
                return (Path(settings.MEDIA_ROOT) / stored[len("/media/") :]).resolve()
            return None
        root = Path(getattr(settings, "PLATFORM_MEDIA_LOCAL_ROOT", Path(settings.MEDIA_ROOT) / "uploads"))
        candidate = (root / relative.lstrip("/")).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            return None
        return candidate

    def _decode_barcodes(self, image_bytes: bytes | None) -> list[str]:
        if not image_bytes:
            return []
        try:
            from PIL import Image, ImageEnhance, ImageOps
            from pyzbar.pyzbar import decode as zbar_decode
        except ImportError:
            return []

        try:
            image = Image.open(io.BytesIO(image_bytes))
        except Exception as exc:  # noqa: BLE001
            logger.info("Unable to open image for barcode decode: %s", exc)
            return []

        variants = [image]
        try:
            gray = ImageOps.grayscale(image)
            variants.extend(
                [
                    gray,
                    ImageOps.autocontrast(gray),
                    ImageEnhance.Contrast(gray).enhance(2.0),
                    gray.resize((gray.width * 2, gray.height * 2)),
                ]
            )
            # Try 90/180/270 for sideways packs.
            for degrees in (90, 180, 270):
                variants.append(gray.rotate(degrees, expand=True))
        except Exception:
            pass

        codes: list[str] = []
        for variant in variants:
            try:
                for item in zbar_decode(variant):
                    value = (item.data or b"").decode("utf-8", errors="ignore").strip()
                    if value and value not in codes:
                        codes.append(value)
            except Exception:
                continue
            if codes:
                break
        return codes

    def _ocr_image(self, *, url: str, image_bytes: bytes | None) -> str:
        text = self._ocr_tesseract(image_bytes)
        if text:
            return text
        return self._ocr_space(url)

    def _ocr_tesseract(self, image_bytes: bytes | None) -> str:
        if not image_bytes:
            return ""
        try:
            import pytesseract
            from PIL import Image, ImageOps
        except ImportError:
            return ""
        try:
            image = Image.open(io.BytesIO(image_bytes))
            gray = ImageOps.grayscale(image)
            gray = ImageOps.autocontrast(gray)
            # Packaging OCR: treat as sparse text block.
            text = pytesseract.image_to_string(gray, config="--psm 6") or ""
            return text.strip()
        except Exception as exc:  # noqa: BLE001
            logger.info("Tesseract OCR failed: %s", exc)
            return ""

    def _ocr_space(self, url: str) -> str:
        if not url:
            return ""
        api_key = (os.environ.get("OCR_SPACE_API_KEY") or "").strip()
        if not api_key:
            return ""
        params = urllib.parse.urlencode(
            {
                "apikey": api_key,
                "url": url,
                "language": "eng",
                "isOverlayRequired": "false",
                "OCREngine": "2",
                "scale": "true",
            }
        )
        endpoint = f"https://api.ocr.space/parse/imageurl?{params}"
        try:
            request = urllib.request.Request(endpoint, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            logger.info("OCR.space failed for %s: %s", url, exc)
            return ""

        if payload.get("IsErroredOnProcessing"):
            logger.info("OCR.space error: %s", payload.get("ErrorMessage"))
            return ""
        results = payload.get("ParsedResults") or []
        if not results:
            return ""
        return str(results[0].get("ParsedText") or "").strip()

    def _parse_packaging_text(
        self,
        *,
        front_text: str,
        back_text: str,
        hint: str,
    ) -> dict[str, str]:
        name = ""
        brand = ""
        pack_size = ""
        description = ""

        for text in (front_text, hint):
            lines = []
            for raw in text.splitlines():
                line = raw.strip()
                if not line or len(line) < 3:
                    continue
                if BARCODE_RE.fullmatch(line.replace(" ", "")):
                    continue
                if QUANTITY_RE.fullmatch(line):
                    continue
                if NOISE_LINE_RE.search(line):
                    continue
                lines.append(line)
            if not lines:
                continue

            # Prefer known brand lines when present.
            lowered_lines = [line.lower() for line in lines]
            for brand_token in PET_BRAND_HINTS:
                for index, line in enumerate(lowered_lines):
                    if brand_token in line:
                        brand = brand_token.title() if len(brand_token) < 20 else lines[index][:120]
                        # Next non-brand line becomes product name when possible.
                        for candidate in lines[index + 1 : index + 4]:
                            if brand_token not in candidate.lower():
                                name = candidate[:200]
                                break
                        if not name:
                            name = lines[index][:200]
                        break
                if brand:
                    break

            if not brand:
                brand = lines[0][:120]
            if not name:
                name = (lines[1] if len(lines) > 1 else lines[0])[:200]
            elif brand and name == brand and len(lines) > 1:
                name = lines[1][:200]

        quantity_match = QUANTITY_RE.search(f"{front_text}\n{back_text}\n{hint}")
        if quantity_match:
            pack_size = quantity_match.group(1).strip()

        ingredients_source = back_text or front_text
        ingredients_match = INGREDIENTS_RE.search(ingredients_source)
        if ingredients_match:
            description = ingredients_match.group(1).strip()
            description = re.split(
                r"\n\s*\n|nutrition|allergen|feeding guide|storage",
                description,
                maxsplit=1,
                flags=re.I,
            )[0].strip()[:2000]
        elif back_text:
            description = back_text.strip()[:2000]

        if hint and not name:
            name = hint[:200]

        return {
            "name": name,
            "brand": brand,
            "pack_size": pack_size,
            "description": description,
        }
