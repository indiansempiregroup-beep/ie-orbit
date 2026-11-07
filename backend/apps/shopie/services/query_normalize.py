"""Normalize abbreviated invoice / OCR product names for free catalog search."""

from __future__ import annotations

import re

# High-frequency trade shortenings for pet catalogs (invoice OCR → catalog wording).
PET_TRADE_EXPANSIONS: dict[str, str] = {
    "str": "star",
    "ped": "pedigree",
}

GENERIC_DROP_TOKENS = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "large",
        "small",
        "medium",
        "pack",
        "pcs",
        "pc",
        "nos",
        "each",
    }
)

# Size / species / form words — not brand identity for match gates.
BRAND_STOPWORDS = frozenset(
    GENERIC_DROP_TOKENS
    | {
        "breed",
        "dog",
        "cat",
        "puppy",
        "pup",
        "kitten",
        "adult",
        "junior",
        "senior",
        "food",
        "dry",
        "wet",
        "starter",
        "mother",
        "chicken",
        "beef",
        "fish",
        "rice",
        "kg",
        "gms",
        "gram",
        "grams",
        "ml",
        "litre",
        "liter",
        "lbs",
        "lb",
        "pro",  # Pedigree PRO line — weak alone; brand gate uses pedigree/ped
    }
)

# Multi-word brand phrases checked as substrings in the query.
KNOWN_BRAND_PHRASES = (
    "pedigree",
    "whiskas",
    "royal canin",
    "purina",
    "drools",
    "fancy feast",
    "hills",
    "cesar",
    "iams",
    "eukanuba",
    "farmina",
    "orijen",
    "acana",
    "authority",
)

# Glued letter+digit codes: RP1520 → RP 1520; keep short tags like 3F intact.
_GLUED_CODE_RE = re.compile(r"\b([A-Za-z]{1,6})(\d{2,})\b")

# Multipack / OCR-glued weight: 6x3kg → "6 x 3 kg" and digit-run "63 kg"
_PACK_WEIGHT_RE = re.compile(
    r"\b(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ltr|litre|liter)\b",
    re.IGNORECASE,
)

_NOISE_PUNCT_RE = re.compile(r"[&/|,;:_]+")
_MULTI_SPACE_RE = re.compile(r"\s+")


def split_glued_alphanumerics(text: str) -> str:
    """Split glued SKU/code fragments while keeping short tags like 3F intact."""
    return _GLUED_CODE_RE.sub(r"\1 \2", text or "")


def expand_pack_weight_patterns(text: str) -> list[str]:
    """Return alternate spellings for NxMkg-style tokens (multipack + OCR digit-run)."""
    variants: list[str] = []
    source = text or ""

    def _spaced(match: re.Match[str]) -> str:
        return f"{match.group(1)} x {match.group(2)} {match.group(3)}"

    spaced = _PACK_WEIGHT_RE.sub(_spaced, source)
    if spaced != source:
        variants.append(spaced)

    def _digit_run(match: re.Match[str]) -> str:
        # Invoice "6x3kg" often maps to catalog "63 kg" (OCR / distributor shorthand).
        return f"{match.group(1)}{match.group(2)} {match.group(3)}"

    digit_run = _PACK_WEIGHT_RE.sub(_digit_run, source)
    if digit_run != source and digit_run not in variants:
        variants.append(digit_run)

    return variants


def collapse_noise(text: str) -> str:
    cleaned = _NOISE_PUNCT_RE.sub(" ", text or "")
    return _MULTI_SPACE_RE.sub(" ", cleaned).strip()


def apply_pet_trade_expansions(text: str) -> str:
    """Expand a tiny set of pet-invoice shortenings (STR→STAR, PED→Pedigree)."""
    tokens = re.findall(r"[A-Za-z0-9]+|[^A-Za-z0-9]+", text or "")
    out: list[str] = []
    for token in tokens:
        lower = token.lower()
        if lower in PET_TRADE_EXPANSIONS:
            expansion = PET_TRADE_EXPANSIONS[lower]
            if token.isupper():
                out.append(expansion.upper())
            elif token[:1].isupper():
                out.append(expansion[:1].upper() + expansion[1:])
            else:
                out.append(expansion)
        else:
            out.append(token)
    return "".join(out)


def _short_distinctive(text: str, *, max_tokens: int = 8) -> str:
    """Brand-ish leading tokens plus distinctive codes; drop ultra-generic words."""
    tokens = re.findall(r"[A-Za-z0-9]+", text or "")
    kept: list[str] = []
    for token in tokens:
        lower = token.lower()
        if lower in GENERIC_DROP_TOKENS:
            continue
        kept.append(token)
        if len(kept) >= max_tokens:
            break
    return " ".join(kept)


def search_query_variants(query: str, *, prefer_pet: bool = False, max_variants: int = 3) -> list[str]:
    """Ordered distinct search strings for free catalog name lookup.

    Prefer the most-normalized form first (glued codes + pack OCR + pet trade
    expansions), then the raw cleaned invoice string, then a short distinctive query.
    """
    raw = collapse_noise((query or "").strip())
    if not raw:
        return []

    ordered: list[str] = []

    def _add(value: str) -> None:
        cleaned = collapse_noise(value)
        if cleaned and cleaned not in ordered:
            ordered.append(cleaned)

    split = split_glued_alphanumerics(raw)
    # Prefer digit-run pack form ("6x3kg" → "63 kg") when present; else spaced multipack.
    pack_forms = expand_pack_weight_patterns(split)
    digit_run = next((form for form in pack_forms if " x " not in form.lower()), "")
    spaced_pack = next((form for form in pack_forms if " x " in form.lower()), "")
    best_structural = digit_run or spaced_pack or split

    if prefer_pet:
        _add(apply_pet_trade_expansions(best_structural))
        _add(apply_pet_trade_expansions(split))

    _add(best_structural)
    _add(raw)
    if spaced_pack and spaced_pack != best_structural:
        _add(spaced_pack)

    short_source = ordered[0] if ordered else raw
    short = _short_distinctive(short_source)
    if short and short.lower() != short_source.lower():
        _add(short)

    return ordered[: max(1, max_variants)]


def query_brand_tokens(query: str) -> set[str]:
    """Distinctive brand-ish tokens that a catalog hit must agree with."""
    lowered = (query or "").lower()
    brands: set[str] = set()
    for phrase in KNOWN_BRAND_PHRASES:
        if phrase in lowered:
            for part in phrase.split():
                if len(part) > 2:
                    brands.add(part)
    tokens = re.findall(r"[a-z0-9]+", lowered)
    token_set = set(tokens)
    if "ped" in token_set:
        brands.update({"ped", "pedigree"})
    # Leading non-generic tokens (invoice brand abbreviations).
    for token in tokens[:2]:
        if len(token) > 2 and token not in BRAND_STOPWORDS and not token.isdigit():
            brands.add(token)
    return brands


def brand_tokens_match(brand_tokens: set[str], haystack: str, haystack_tokens: set[str]) -> bool:
    """True when every required brand signal is absent → False; empty brands → True."""
    if not brand_tokens:
        return True
    return any(token_matches(token, haystack, haystack_tokens) or token in haystack_tokens for token in brand_tokens)


def _consonant_key(value: str) -> str:
    """Drop vowels so invoice shortenings like STR align with STAR."""
    return "".join(ch for ch in (value or "").lower() if ch.isalpha() and ch not in "aeiou")


def token_matches(query_token: str, haystack: str, haystack_tokens: set[str]) -> bool:
    """Prefix / consonant-skeleton soft-match against tokens (len ≥ 3).

    Deliberately avoids raw substring checks — ``str`` must not match inside
    ``industrie`` (false positive that poisoned invoice name search).
    """
    del haystack  # kept in signature for call-site compatibility
    token = (query_token or "").lower()
    if len(token) <= 2:
        return False
    query_key = _consonant_key(token)
    for hay in haystack_tokens:
        if len(hay) <= 2:
            continue
        if hay == token:
            return True
        if hay.startswith(token) or token.startswith(hay):
            return True
        # Glued codes: query 1520 vs haystack token rp1520
        if token.isdigit() and len(token) >= 3 and hay.endswith(token):
            return True
        # STR ↔ STAR: same consonants, small length gap (dropped vowels).
        if query_key and query_key == _consonant_key(hay) and abs(len(token) - len(hay)) <= 2:
            return True
    return False
