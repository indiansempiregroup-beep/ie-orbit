"""Indian state/UT name → 2-digit GST state code mapping.

Codes match the first two digits of a GSTIN / the GST "Place of Supply" state
codes published by CBIC. Lookups are case-insensitive and also accept common
abbreviations (e.g. "MH", "TN") and the state code itself (e.g. "27").
"""

from __future__ import annotations

STATE_NAME_TO_CODE: dict[str, str] = {
    "jammu and kashmir": "01",
    "himachal pradesh": "02",
    "punjab": "03",
    "chandigarh": "04",
    "uttarakhand": "05",
    "haryana": "06",
    "delhi": "07",
    "rajasthan": "08",
    "uttar pradesh": "09",
    "bihar": "10",
    "sikkim": "11",
    "arunachal pradesh": "12",
    "nagaland": "13",
    "manipur": "14",
    "mizoram": "15",
    "tripura": "16",
    "meghalaya": "17",
    "assam": "18",
    "west bengal": "19",
    "jharkhand": "20",
    "odisha": "21",
    "orissa": "21",
    "chattisgarh": "22",
    "chhattisgarh": "22",
    "madhya pradesh": "23",
    "gujarat": "24",
    "daman and diu": "25",
    "dadra and nagar haveli and daman and diu": "26",
    "dadra and nagar haveli": "26",
    "maharashtra": "27",
    "andhra pradesh (before division)": "28",
    "karnataka": "29",
    "goa": "30",
    "lakshadweep": "31",
    "kerala": "32",
    "tamil nadu": "33",
    "puducherry": "34",
    "pondicherry": "34",
    "andaman and nicobar islands": "35",
    "telangana": "36",
    "andhra pradesh": "37",
    "ladakh": "38",
    "other territory": "97",
    "other country": "99",
}

# Common two-letter abbreviations used across the platform's UI/forms.
STATE_ABBREVIATION_TO_CODE: dict[str, str] = {
    "jk": "01",
    "hp": "02",
    "pb": "03",
    "ch": "04",
    "uk": "05",
    "ua": "05",
    "hr": "06",
    "dl": "07",
    "rj": "08",
    "up": "09",
    "br": "10",
    "sk": "11",
    "ar": "12",
    "nl": "13",
    "mn": "14",
    "mz": "15",
    "tr": "16",
    "ml": "17",
    "as": "18",
    "wb": "19",
    "jh": "20",
    "or": "21",
    "od": "21",
    "ct": "22",
    "cg": "22",
    "mp": "23",
    "gj": "24",
    "dd": "25",
    "dn": "26",
    "mh": "27",
    "ka": "29",
    "ga": "30",
    "ld": "31",
    "kl": "32",
    "tn": "33",
    "py": "34",
    "an": "35",
    "tg": "36",
    "ts": "36",
    "ap": "37",
    "la": "38",
}

VALID_STATE_CODES = frozenset(STATE_NAME_TO_CODE.values()) | frozenset(
    STATE_ABBREVIATION_TO_CODE.values()
)


def resolve_state_code(value: str | None) -> str:
    """Best-effort resolution of a state name/abbreviation/GSTIN prefix to a 2-digit code.

    Returns an empty string when the value cannot be resolved.
    """
    if not value:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    # Already a 2-digit numeric state code.
    if raw.isdigit() and len(raw) == 2:
        return raw
    # A GSTIN — the first two characters are the state code.
    if len(raw) >= 15 and raw[:2].isdigit():
        return raw[:2]
    lowered = raw.lower()
    if lowered in STATE_NAME_TO_CODE:
        return STATE_NAME_TO_CODE[lowered]
    if lowered in STATE_ABBREVIATION_TO_CODE:
        return STATE_ABBREVIATION_TO_CODE[lowered]
    return ""
