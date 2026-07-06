from __future__ import annotations

DEFAULT_ROLE_DEFINITIONS: tuple[dict[str, str], ...] = (
    {"code": "super_admin", "name": "Super Admin"},
    {"code": "platform_admin", "name": "Platform Admin"},
    {"code": "business_owner", "name": "Business Owner"},
    {"code": "manager", "name": "Manager"},
    {"code": "staff", "name": "Staff"},
    {"code": "customer", "name": "Customer"},
)

DEFAULT_PERMISSION_DEFINITIONS: tuple[dict[str, str], ...] = (
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

DEFAULT_ROLE_PERMISSION_CODES: dict[str, tuple[str, ...]] = {
    "super_admin": tuple(permission["code"] for permission in DEFAULT_PERMISSION_DEFINITIONS),
    "platform_admin": tuple(permission["code"] for permission in DEFAULT_PERMISSION_DEFINITIONS),
    "business_owner": ("iam:user:read", "iam:user:update_self"),
    "manager": ("iam:user:update_self",),
    "staff": ("iam:user:update_self",),
    "customer": ("iam:user:update_self",),
}
