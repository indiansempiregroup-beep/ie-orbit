from __future__ import annotations

from typing import Any, Iterable

from rest_framework.exceptions import ValidationError

from apps.tenancy.models import Tenant, TenantSettings

ROLE_CODES = ("business_owner", "manager", "staff")

ALWAYS_ON_MENUS = frozenset({"home", "alerts", "profile"})
OWNER_ALWAYS_ON_MENUS = ALWAYS_ON_MENUS | {"settings"}

# Sections inside Books. "books" with none of these keys means every section.
# A saved subset (books + at least one section) is kept as-is.
BOOKS_CHILD_MENUS: tuple[dict[str, Any], ...] = (
    {"key": "booksSale", "label": "Sale", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksQuotations", "label": "Estimates / Proforma", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksNotes", "label": "Credit / Debit notes", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksPurchase", "label": "Purchase", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksInvoiceScan", "label": "Scan invoice", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksExpense", "label": "Expense", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksStock", "label": "Stock adjust", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksCash", "label": "Cash & bank", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksParties", "label": "Suppliers", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksReports", "label": "Reports", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksCompliance", "label": "E-invoice & e-way", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksSaleOrders", "label": "Sale orders", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksPurchaseOrders", "label": "Purchase orders", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksChallans", "label": "Delivery challans", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksGodowns", "label": "Godowns", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksCheques", "label": "Cheques", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksLoans", "label": "Loans", "group": "sale", "group_label": "Sale", "parent": "books"},
    {"key": "booksLoyalty", "label": "Reward points", "group": "sale", "group_label": "Sale", "parent": "books"},
)
BOOKS_CHILD_KEYS = frozenset(item["key"] for item in BOOKS_CHILD_MENUS)

# Hidden in the product default selection. Owners can turn these back on per role.
DEFAULT_HIDDEN_MENUS = frozenset(
    {
        "books",
        *BOOKS_CHILD_KEYS,
        "coupons",
        "gbp",
        "sync",
        "ads",
        "referral",
        "automations",
        "assistant",
        "services",
    }
)

# Already gated off for staff by permissions — keep that default.
STAFF_DEFAULT_HIDDEN_MENUS = frozenset({"staff", "bi", "tickets", "settings"})

MENU_CATALOG: tuple[dict[str, Any], ...] = (
    {"key": "home", "label": "Home", "group": "primary", "group_label": "Primary", "always_on": True},
    {"key": "bookings", "label": "Bookings", "group": "primary", "group_label": "Primary"},
    {"key": "calendar", "label": "Calendar", "group": "primary", "group_label": "Primary"},
    {"key": "alerts", "label": "Alerts", "group": "primary", "group_label": "Primary", "always_on": True},
    {"key": "assistant", "label": "Assistant", "group": "primary", "group_label": "Primary"},
    {"key": "pos", "label": "POS", "group": "sale", "group_label": "Sale"},
    {"key": "books", "label": "Books", "group": "sale", "group_label": "Sale"},
    *BOOKS_CHILD_MENUS,
    {"key": "products", "label": "Products", "group": "sale", "group_label": "Sale"},
    {"key": "masterFiles", "label": "Master Files", "group": "sale", "group_label": "Sale"},
    {"key": "orders", "label": "Orders", "group": "sale", "group_label": "Sale"},
    {"key": "returns", "label": "Returns", "group": "sale", "group_label": "Sale"},
    {"key": "zones", "label": "Delivery zones", "group": "sale", "group_label": "Sale"},
    {"key": "instantDelivery", "label": "Instant delivery", "group": "sale", "group_label": "Sale"},
    {"key": "coupons", "label": "Coupons", "group": "sale", "group_label": "Sale"},
    {"key": "pets", "label": "Pets", "group": "sale", "group_label": "Sale"},
    {"key": "wa", "label": "WhatsApp", "group": "grow", "group_label": "Grow"},
    {"key": "gbp", "label": "Google Profile", "group": "grow", "group_label": "Grow"},
    {"key": "sync", "label": "Sync & share", "group": "grow", "group_label": "Grow"},
    {"key": "utils", "label": "Utilities", "group": "grow", "group_label": "Grow"},
    {"key": "ads", "label": "Ads", "group": "grow", "group_label": "Grow"},
    {"key": "referral", "label": "Referrals", "group": "grow", "group_label": "Grow"},
    {"key": "automations", "label": "Automation Creator", "group": "automations", "group_label": "Automations"},
    {"key": "customers", "label": "Customers", "group": "business", "group_label": "Business"},
    {"key": "reviews", "label": "Reviews", "group": "business", "group_label": "Business"},
    {"key": "services", "label": "Services", "group": "business", "group_label": "Business"},
    {"key": "staff", "label": "Staff", "group": "business", "group_label": "Business"},
    {"key": "bi", "label": "Business Intelligence", "group": "business", "group_label": "Business"},
    {"key": "tickets", "label": "Support tickets", "group": "business", "group_label": "Business"},
    {"key": "settings", "label": "Settings", "group": "business", "group_label": "Business"},
    {"key": "profile", "label": "Profile", "group": "account", "group_label": "Account", "always_on": True},
)

CATALOG_KEYS = frozenset(item["key"] for item in MENU_CATALOG)
CATALOG_BY_KEY = {item["key"]: item for item in MENU_CATALOG}
PLATFORM_ROLES = frozenset({"platform_admin", "super_admin"})
TENANT_ROLE_PRIORITY = ("business_owner", "manager", "staff")


def _always_on_for_role(role_code: str) -> frozenset[str]:
    if role_code == "business_owner":
        return OWNER_ALWAYS_ON_MENUS
    return ALWAYS_ON_MENUS


def default_hidden_for_role(role_code: str) -> frozenset[str]:
    if role_code == "business_owner":
        return frozenset()
    hidden = set(DEFAULT_HIDDEN_MENUS)
    if role_code == "staff":
        hidden |= STAFF_DEFAULT_HIDDEN_MENUS
    hidden -= set(_always_on_for_role(role_code))
    return frozenset(hidden)


def default_enabled_for_role(role_code: str) -> list[str]:
    if role_code == "business_owner":
        return _normalize_enabled((item["key"] for item in MENU_CATALOG), role_code)
    hidden = default_hidden_for_role(role_code)
    always_on = _always_on_for_role(role_code)
    enabled = [item["key"] for item in MENU_CATALOG if item["key"] not in hidden or item["key"] in always_on]
    return _normalize_enabled(enabled, role_code)


def default_enabled_map() -> dict[str, list[str]]:
    return {role: default_enabled_for_role(role) for role in ROLE_CODES}


def _normalize_enabled(keys: Iterable[str], role_code: str) -> list[str]:
    always_on = _always_on_for_role(role_code)
    seen: set[str] = set()
    ordered: list[str] = []
    for key in keys:
        if key not in CATALOG_KEYS or key in seen:
            continue
        seen.add(key)
        ordered.append(key)
    for key in MENU_CATALOG:
        catalog_key = key["key"]
        if catalog_key in always_on and catalog_key not in seen:
            ordered.append(catalog_key)
            seen.add(catalog_key)
    # Preserve catalog order for a stable editor.
    catalog_order = {item["key"]: index for index, item in enumerate(MENU_CATALOG)}
    ordered.sort(key=lambda item: catalog_order.get(item, 999))
    return _apply_books_sections(ordered, catalog_order)


def _apply_books_sections(ordered: list[str], catalog_order: dict[str, int]) -> list[str]:
    """Books with no section keys grants every section. A listed subset is kept."""
    selected = set(ordered)
    if "books" not in selected:
        if not BOOKS_CHILD_KEYS.intersection(selected):
            return ordered
        return [key for key in ordered if key not in BOOKS_CHILD_KEYS]
    if BOOKS_CHILD_KEYS.intersection(selected):
        return ordered
    expanded = selected | set(BOOKS_CHILD_KEYS)
    return sorted(expanded, key=lambda item: catalog_order.get(item, 999))


ROLE_MENUS_SCHEMA_VERSION = 2


def _stored_map(settings: TenantSettings | None) -> dict[str, list[str]]:
    raw = getattr(settings, "role_menus", None) if settings is not None else None
    if not isinstance(raw, dict):
        return {}
    stored: dict[str, list[str]] = {}
    for role in ROLE_CODES:
        value = raw.get(role)
        if isinstance(value, list):
            stored[role] = [str(item) for item in value if isinstance(item, str)]
    return stored


def _schema_version(settings: TenantSettings | None) -> int:
    raw = getattr(settings, "role_menus", None) if settings is not None else None
    if not isinstance(raw, dict):
        return 0
    try:
        return int(raw.get("_version") or 0)
    except (TypeError, ValueError):
        return 0


def _is_legacy_owner_default(keys: list[str]) -> bool:
    """Previous owner default hid the deferred menus. Treat that snapshot as unset."""
    stored = set(keys)
    old_default = {item["key"] for item in MENU_CATALOG if item["key"] not in DEFAULT_HIDDEN_MENUS}
    old_default |= set(OWNER_ALWAYS_ON_MENUS)
    return stored == old_default


def resolve_enabled_map(settings: TenantSettings | None) -> dict[str, list[str]]:
    stored = _stored_map(settings)
    version = _schema_version(settings)
    resolved: dict[str, list[str]] = {}
    for role in ROLE_CODES:
        if (
            role == "business_owner"
            and role in stored
            and version < ROLE_MENUS_SCHEMA_VERSION
            and _is_legacy_owner_default(stored[role])
        ):
            resolved[role] = default_enabled_for_role(role)
        elif role in stored:
            resolved[role] = _normalize_enabled(stored[role], role)
        else:
            resolved[role] = default_enabled_for_role(role)
    return resolved


def primary_tenant_role(role_codes: Iterable[str]) -> str | None:
    roles = set(role_codes)
    for role in TENANT_ROLE_PRIORITY:
        if role in roles:
            return role
    return None


def enabled_menus_for_roles(settings: TenantSettings | None, role_codes: Iterable[str]) -> list[str]:
    roles = list(role_codes)
    primary = primary_tenant_role(roles)
    if primary:
        allowed = set(resolve_enabled_map(settings)[primary])
        return [item["key"] for item in MENU_CATALOG if item["key"] in allowed]
    if any(role in PLATFORM_ROLES for role in roles):
        return [item["key"] for item in MENU_CATALOG]
    allowed = set(default_enabled_for_role("staff"))
    return [item["key"] for item in MENU_CATALOG if item["key"] in allowed]


def catalog_payload() -> list[dict[str, Any]]:
    return [
        {
            "key": item["key"],
            "label": item["label"],
            "group": item["group"],
            "group_label": item["group_label"],
            "always_on": bool(item.get("always_on")),
            "default_hidden": item["key"] in DEFAULT_HIDDEN_MENUS,
            **({"parent": item["parent"]} if item.get("parent") else {}),
        }
        for item in MENU_CATALOG
    ]


def serialize_role_menus(
    settings: TenantSettings | None,
    *,
    role_codes: Iterable[str],
) -> dict[str, Any]:
    enabled = resolve_enabled_map(settings)
    return {
        "catalog": catalog_payload(),
        "roles": list(ROLE_CODES),
        "defaults": default_enabled_map(),
        "enabled": enabled,
        "enabled_menus": enabled_menus_for_roles(settings, role_codes),
        "hidden_by_default": sorted(DEFAULT_HIDDEN_MENUS),
    }


def validate_enabled_payload(payload: Any) -> dict[str, list[str]]:
    if not isinstance(payload, dict):
        raise ValidationError({"enabled": "Must be an object of role code to menu keys."})
    unknown_roles = [key for key in payload.keys() if key not in ROLE_CODES]
    if unknown_roles:
        raise ValidationError({"enabled": f"Unknown roles: {', '.join(sorted(unknown_roles))}."})
    cleaned: dict[str, list[str]] = {}
    for role in ROLE_CODES:
        if role not in payload:
            continue
        value = payload[role]
        if not isinstance(value, list):
            raise ValidationError({role: "Must be a list of menu keys."})
        cleaned[role] = _normalize_enabled((str(item) for item in value if isinstance(item, str)), role)
    return cleaned


def save_role_menus(settings: TenantSettings, enabled: dict[str, list[str]]) -> TenantSettings:
    current = resolve_enabled_map(settings)
    current.update(enabled)
    settings.role_menus = {**current, "_version": ROLE_MENUS_SCHEMA_VERSION}
    settings.save(update_fields=["role_menus", "updated_at"])
    return settings


def tenant_role_menus_payload(tenant: Tenant, *, role_codes: Iterable[str]) -> dict[str, Any]:
    settings = TenantSettings.objects.filter(tenant=tenant).first()
    return serialize_role_menus(settings, role_codes=role_codes)
