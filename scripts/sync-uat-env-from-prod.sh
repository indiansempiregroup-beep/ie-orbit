#!/bin/sh
# Copy production .env to UAT and rewrite host / backup keys only.
# Secrets, payment keys, R2, SMTP, and GA stay as production.
set -eu

SRC="${1:-/opt/ie-orbit/.env}"
DEST="${2:-/opt/ie-orbit-uat/.env}"

if [ ! -f "$SRC" ]; then
  echo "Missing source env: $SRC" >&2
  exit 1
fi

python3 - "$SRC" "$DEST" <<'PY'
import sys
from pathlib import Path

src = Path(sys.argv[1])
dest = Path(sys.argv[2])
text = src.read_text()

replacements = {
    "DJANGO_ALLOWED_HOSTS": "api-uat.ie-orbit.com,app-uat.ie-orbit.com,uat.ie-orbit.com,ops-uat.ie-orbit.com,127.0.0.1,localhost,backend",
    "CORS_ALLOWED_ORIGINS": "https://uat.ie-orbit.com,https://app-uat.ie-orbit.com,https://ops-uat.ie-orbit.com",
    "CSRF_TRUSTED_ORIGINS": "https://api-uat.ie-orbit.com,https://uat.ie-orbit.com,https://app-uat.ie-orbit.com,https://ops-uat.ie-orbit.com",
    "FRONTEND_BASE_URL": "https://uat.ie-orbit.com",
    "PUBLIC_API_ORIGIN": "https://api-uat.ie-orbit.com",
    "API_HOST": "api-uat.ie-orbit.com",
    "WEB_HOST": "app-uat.ie-orbit.com",
    "SITE_HOST": "uat.ie-orbit.com",
    "WWW_HOST": "uat.ie-orbit.com",
    "OPS_WEB_HOST": "ops-uat.ie-orbit.com",
    "VITE_PUBLIC_SITE_URL": "https://uat.ie-orbit.com",
    "VITE_ADMIN_APP_URL": "https://app-uat.ie-orbit.com",
    "VITE_OPS_MOBILE_WEB_URL": "https://ops-uat.ie-orbit.com",
    "EXPO_PUBLIC_API_BASE_URL": "https://api-uat.ie-orbit.com/api/v1",
    "EXPO_PUBLIC_REFERRAL_LINK_BASE_URL": "https://uat.ie-orbit.com",
    "EXPO_PUBLIC_APP_DOWNLOAD_URL": "https://uat.ie-orbit.com/download",
    "BACKUP_S3_PREFIX": "backups/postgres-uat",
}

lines = text.splitlines(keepends=True)
found = set()
out = []
for line in lines:
    stripped = line.lstrip()
    replaced = False
    if stripped and not stripped.startswith("#"):
        for key, value in replacements.items():
            prefix = key + "="
            if stripped.startswith(prefix):
                newline = "\n" if line.endswith("\n") else ""
                out.append(f"{key}={value}{newline}")
                found.add(key)
                replaced = True
                break
    if not replaced:
        out.append(line)

missing = [key for key in replacements if key not in found]
if missing:
    if out and not str(out[-1]).endswith("\n"):
        out.append("\n")
    out.append("\n# UAT host overrides\n")
    for key in missing:
        out.append(f"{key}={replacements[key]}\n")

dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text("".join(out))
print(f"Wrote {dest} from {src} (hosts rewritten; secrets unchanged)")
PY
