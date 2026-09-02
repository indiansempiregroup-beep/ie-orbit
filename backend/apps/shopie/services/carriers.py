from __future__ import annotations

CARRIER_CHOICES: list[dict[str, str]] = [
    {"id": "delhivery", "label": "Delhivery"},
    {"id": "bluedart", "label": "Blue Dart"},
    {"id": "dtdc", "label": "DTDC"},
    {"id": "india_post", "label": "India Post"},
    {"id": "shiprocket", "label": "Shiprocket"},
    {"id": "ekart", "label": "Ekart"},
    {"id": "xpressbees", "label": "XpressBees"},
    {"id": "other", "label": "Other"},
]

_TRACKING_URL_TEMPLATES: dict[str, str] = {
    "delhivery": "https://www.delhivery.com/track/package/{awb}",
    "bluedart": "https://www.bluedart.com/tracking?trackno={awb}",
    "dtdc": "https://www.dtdc.in/tracking.asp?strCnno={awb}",
    "india_post": "https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx?{awb}",
    "shiprocket": "https://shiprocket.co/tracking/{awb}",
    "ekart": "https://ekartlogistics.com/track/{awb}",
    "xpressbees": "https://www.xpressbees.com/track/{awb}",
}


def carrier_label(carrier_id: str, override: str = "") -> str:
    if override.strip():
        return override.strip()
    normalized = str(carrier_id or "").strip().lower()
    for item in CARRIER_CHOICES:
        if item["id"] == normalized:
            return item["label"]
    return normalized.title() if normalized else "Courier"


def tracking_url_for(*, carrier: str, tracking_number: str, override: str = "") -> str:
    if override.strip():
        return override.strip()
    awb = str(tracking_number or "").strip()
    if not awb:
        return ""
    template = _TRACKING_URL_TEMPLATES.get(str(carrier or "").strip().lower())
    if not template:
        return ""
    return template.format(awb=awb)
