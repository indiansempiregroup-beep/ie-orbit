from __future__ import annotations

DEFAULT_ROLE_DEFINITIONS: tuple[dict[str, str], ...] = (
    {"code": "super_admin", "name": "Super Admin"},
    {"code": "platform_admin", "name": "Platform Admin"},
    {"code": "business_owner", "name": "Business Owner"},
    {"code": "manager", "name": "Manager"},
    {"code": "staff", "name": "Staff"},
    {"code": "customer", "name": "Customer"},
)

IAM_PERMISSION_DEFINITIONS: tuple[dict[str, str], ...] = (
    {
        "code": "iam:user:read",
        "name": "Read users",
        "resource": "iam.user",
        "action": "read",
    },
    {
        "code": "iam:user:update_self",
        "name": "Update own profile",
        "resource": "iam.user",
        "action": "update_self",
    },
    {
        "code": "iam:role:assign",
        "name": "Assign roles",
        "resource": "iam.role",
        "action": "assign",
    },
    {
        "code": "iam:permission:assign",
        "name": "Assign permissions",
        "resource": "iam.permission",
        "action": "assign",
    },
)

DOMAIN_PERMISSION_DEFINITIONS: tuple[dict[str, str], ...] = (
    {"code": "business:read", "name": "Read businesses", "resource": "business", "action": "read"},
    {
        "code": "business:write",
        "name": "Write businesses",
        "resource": "business",
        "action": "write",
    },
    {
        "code": "business:update",
        "name": "Update businesses",
        "resource": "business",
        "action": "update",
    },
    {
        "code": "business:manage",
        "name": "Manage businesses",
        "resource": "business",
        "action": "manage",
    },
    {
        "code": "customer:read",
        "name": "Read customers",
        "resource": "customer",
        "action": "read",
    },
    {
        "code": "customer:write",
        "name": "Write customers",
        "resource": "customer",
        "action": "write",
    },
    {
        "code": "customer:manage",
        "name": "Manage customers",
        "resource": "customer",
        "action": "manage",
    },
    {
        "code": "service:read",
        "name": "Read services",
        "resource": "service",
        "action": "read",
    },
    {
        "code": "service:write",
        "name": "Write services",
        "resource": "service",
        "action": "write",
    },
    {
        "code": "service:manage",
        "name": "Manage services",
        "resource": "service",
        "action": "manage",
    },
    {
        "code": "staff:read",
        "name": "Read staff",
        "resource": "staff",
        "action": "read",
    },
    {"code": "staff:write", "name": "Write staff", "resource": "staff", "action": "write"},
    {"code": "staff:manage", "name": "Manage staff", "resource": "staff", "action": "manage"},
    {
        "code": "booking:read",
        "name": "Read bookings",
        "resource": "booking",
        "action": "read",
    },
    {
        "code": "booking:write",
        "name": "Write bookings",
        "resource": "booking",
        "action": "write",
    },
    {
        "code": "booking:manage",
        "name": "Manage bookings",
        "resource": "booking",
        "action": "manage",
    },
    {"code": "media:read", "name": "Read media", "resource": "media", "action": "read"},
    {"code": "media:write", "name": "Write media", "resource": "media", "action": "write"},
    {"code": "media:manage", "name": "Manage media", "resource": "media", "action": "manage"},
)

# Backward-compatible alias used by the initial IAM seed migration.
DEFAULT_PERMISSION_DEFINITIONS: tuple[dict[str, str], ...] = IAM_PERMISSION_DEFINITIONS

ALL_PERMISSION_DEFINITIONS: tuple[dict[str, str], ...] = (
    IAM_PERMISSION_DEFINITIONS + DOMAIN_PERMISSION_DEFINITIONS
)

_BUSINESS_DOMAIN_CODES = tuple(permission["code"] for permission in DOMAIN_PERMISSION_DEFINITIONS)

DEFAULT_ROLE_PERMISSION_CODES: dict[str, tuple[str, ...]] = {
    "super_admin": tuple(permission["code"] for permission in ALL_PERMISSION_DEFINITIONS),
    "platform_admin": tuple(permission["code"] for permission in ALL_PERMISSION_DEFINITIONS),
    "business_owner": (
        "iam:user:read",
        "iam:user:update_self",
        "iam:role:assign",
    )
    + _BUSINESS_DOMAIN_CODES,
    "manager": (
        "iam:user:update_self",
        "business:read",
        "business:update",
        "customer:read",
        "customer:write",
        "customer:manage",
        "service:read",
        "service:write",
        "service:manage",
        "staff:read",
        "staff:write",
        "booking:read",
        "booking:write",
        "booking:manage",
        "media:read",
        "media:write",
    ),
    "staff": (
        "iam:user:update_self",
        "business:read",
        "customer:read",
        "customer:write",
        "service:read",
        "staff:read",
        "booking:read",
        "booking:write",
        "media:read",
    ),
    "customer": ("iam:user:update_self", "customer:read"),
}

DEFAULT_OWNER_ROLE_CODE = "business_owner"
