"""
Platform Core domain registry.

Logical grouping of existing Django apps into Platform Core vs Application domains.
This module has no database tables and is not required in INSTALLED_APPS.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

DomainLayer = Literal["foundation", "platform_core", "application"]


@dataclass(frozen=True)
class DomainEntry:
    id: str
    label: str
    layer: DomainLayer
    django_apps: tuple[str, ...] = ()
    owns: tuple[str, ...] = ()
    consumes: tuple[str, ...] = ()


PLATFORM_CORE: tuple[DomainEntry, ...] = (
    DomainEntry(
        id="tenant",
        label="Tenant",
        layer="foundation",
        django_apps=("tenancy",),
        owns=("tenant", "organization", "tenant_settings", "branding"),
    ),
    DomainEntry(
        id="business",
        label="Business",
        layer="platform_core",
        django_apps=("businesses",),
        owns=("business", "business_profile", "business_settings", "business_media"),
    ),
    DomainEntry(
        id="customer",
        label="Customer",
        layer="platform_core",
        django_apps=("customers",),
        owns=("customer", "customer_profile", "addresses", "tags", "notes"),
    ),
    DomainEntry(
        id="staff",
        label="Staff",
        layer="platform_core",
        django_apps=("staff",),
        owns=("staff", "employment", "business_roles", "skills"),
        consumes=("authentication",),
    ),
    DomainEntry(
        id="service_catalog",
        label="Service Catalog",
        layer="platform_core",
        django_apps=("services",),
        owns=("service", "service_category", "pricing", "duration"),
    ),
    DomainEntry(
        id="identity",
        label="Identity",
        layer="foundation",
        django_apps=("authentication",),
        owns=("user", "role", "permission", "session"),
    ),
    DomainEntry(
        id="media",
        label="Media",
        layer="platform_core",
        django_apps=("platform_media",),
        owns=("media", "media_folder"),
    ),
    DomainEntry(
        id="notifications",
        label="Notifications",
        layer="platform_core",
        django_apps=("notifications",),
        owns=("notification", "notification_template", "notification_preference"),
    ),
)

APPLICATION_DOMAINS: dict[str, tuple[DomainEntry, ...]] = {
    "appointie": (
        DomainEntry(
            id="bookings",
            label="Bookings",
            layer="application",
            django_apps=("bookings",),
            owns=("booking", "availability", "schedules"),
            consumes=("customer", "staff", "service_catalog", "business"),
        ),
        DomainEntry(
            id="calendar",
            label="Calendar Integration",
            layer="application",
            django_apps=("calendar",),
            owns=("calendar_connection",),
        ),
    ),
    "shopie": (
        DomainEntry(
            id="shop_commerce",
            label="ShopIE Commerce",
            layer="application",
            django_apps=("shopie",),
            owns=(
                "shop_product",
                "shop_barcode",
                "shop_order",
                "shop_stock",
                "shop_invoice",
                "shop_quotation",
            ),
            consumes=("customer", "business", "media"),
        ),
    ),
    "invoiceie": (
        DomainEntry(
            id="invoicing",
            label="Invoicing (legacy → ShopIE Billing)",
            layer="application",
            django_apps=(),
            owns=("invoice", "payment", "tax", "refund"),
            consumes=("customer", "staff", "service_catalog", "business"),
        ),
    ),
    "crmie": (
        DomainEntry(
            id="crm",
            label="CRM",
            layer="application",
            django_apps=(),
            owns=("campaign", "loyalty", "automation"),
            consumes=("customer", "staff", "business"),
        ),
    ),
}

FUTURE_PLATFORM_CORE: tuple[str, ...] = (
    "branch",
    "custom_fields",
    "audit_log",
    "tags (unified)",
    "dashboard_preferences",
)


def is_platform_core_app(app_label: str) -> bool:
    return any(app_label in entry.django_apps for entry in PLATFORM_CORE)


def apps_for_product(product_code: str) -> tuple[str, ...]:
    entries = APPLICATION_DOMAINS.get(product_code, ())
    apps: list[str] = []
    for entry in entries:
        apps.extend(entry.django_apps)
    return tuple(apps)
