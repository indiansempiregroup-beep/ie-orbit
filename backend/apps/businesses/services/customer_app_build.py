from __future__ import annotations

import base64
import json
import logging
import os
import re
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings
from django.utils import timezone

from apps.businesses.models import Business, WhiteLabelProfile
from apps.businesses.services.white_label import (
    effective_logo,
    ensure_white_label_profile,
    serialize_white_label_profile,
)

EAS_CUSTOMER_PROJECT_ID = "d3605998-b92a-497d-a72f-8028df3ca64d"
EAS_ANDROID_SHA1 = "70:D2:64:E9:71:3D:41:4D:CA:D6:64:EA:E5:C4:B5:CB:52:3A:7E:99"
FIREBASE_PROJECT_ID = "ie-orbit"
GOOGLE_CLOUD_OAUTH_PROJECT = "still-cipher-490712-n7"
WEB_OAUTH_CLIENT_ID = (
    "373269001775-493p9n4iglmilp2i0990q3n19sfjpr6k.apps.googleusercontent.com"
)

logger = logging.getLogger(__name__)


def _public_api_base() -> str:
    """Prod vs UAT: derive from PUBLIC_API_ORIGIN so machine payloads and APKs hit the right API."""
    origin = (
        getattr(settings, "PUBLIC_API_ORIGIN", None)
        or os.getenv("PUBLIC_API_ORIGIN")
        or "https://api.ie-orbit.com"
    ).rstrip("/")
    return f"{origin}/api/v1"


def suggested_android_package(*, tenant_slug: str) -> str:
    compact = re.sub(r"[^a-z0-9]", "", (tenant_slug or "").lower())
    return f"com.ieorbit.{compact or 'app'}"


def suggested_app_slug(*, tenant_slug: str, business_code: str) -> str:
    flavor = f"{tenant_slug}-{business_code}".replace("_", "-")
    # Prefer short slug from tenant when codes match (sunita-spa-sunita-spa → sunita-spa).
    if tenant_slug and business_code and tenant_slug == business_code:
        return tenant_slug.replace("_", "-")
    return flavor


def fill_white_label_defaults(profile: WhiteLabelProfile) -> WhiteLabelProfile:
    """Ensure package / slug exist so admin and EAS can run without curl."""
    business = profile.business
    tenant = business.tenant
    changed = False
    if not (profile.bundle_id_android or "").strip():
        package = suggested_android_package(tenant_slug=tenant.slug)
        profile.bundle_id_android = package
        profile.bundle_id_ios = profile.bundle_id_ios or package
        changed = True
    if not (profile.bundle_id_ios or "").strip():
        profile.bundle_id_ios = profile.bundle_id_android
        changed = True
    if not (profile.app_slug or "").strip() or profile.app_slug == profile.flavor_key:
        short = suggested_app_slug(tenant_slug=tenant.slug, business_code=business.business_code)
        if profile.app_slug != short:
            profile.app_slug = short
            changed = True
    if not profile.white_label_enabled:
        profile.white_label_enabled = True
        changed = True
    if changed:
        profile.save()
    return profile


def ensure_customer_app_profile(*, business: Business) -> WhiteLabelProfile:
    profile = ensure_white_label_profile(business=business)
    return fill_white_label_defaults(profile)


def _metadata(profile: WhiteLabelProfile) -> dict[str, Any]:
    raw = profile.build_metadata
    return dict(raw) if isinstance(raw, dict) else {}


def _save_metadata(profile: WhiteLabelProfile, metadata: dict[str, Any]) -> None:
    profile.build_metadata = metadata
    profile.save(update_fields=["build_metadata", "updated_at"])


def _normalize_hex_color(value: str | None, fallback: str) -> str:
    raw = str(value or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", raw):
        return raw.lower()
    if re.fullmatch(r"#[0-9a-fA-F]{3}", raw):
        return f"#{raw[1]*2}{raw[2]*2}{raw[3]*2}".lower()
    return fallback


def _normalize_icon_padding(value: object, fallback: float = 0.22) -> float:
    try:
        pad = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback
    return max(0.08, min(0.36, pad))


def icon_settings_from_profile(profile: WhiteLabelProfile) -> dict[str, Any]:
    meta = _metadata(profile)
    primary = _normalize_hex_color(profile.primary_color, "#0F6CBD")
    mode = str(meta.get("icon_mode") or "plate").strip().lower()
    if mode not in {"plate", "as-is"}:
        mode = "plate"
    # Dedicated override always wins as full icon.
    if str(meta.get("app_icon_url") or "").strip():
        mode = "as-is"
    return {
        "mode": mode,
        "background": _normalize_hex_color(meta.get("icon_background"), primary),
        "padding": _normalize_icon_padding(meta.get("icon_padding"), 0.22),
        "splash_background": _normalize_hex_color(meta.get("splash_background"), primary),
    }


def customer_app_recipe(profile: WhiteLabelProfile) -> dict[str, Any]:
    business = profile.business
    tenant = business.tenant
    package = (profile.bundle_id_android or "").strip()
    flavor = profile.flavor_key
    meta = _metadata(profile)
    settings = icon_settings_from_profile(profile)
    return {
        "tenant_slug": tenant.slug,
        "business_id": str(business.id),
        "business_code": business.business_code,
        "flavor_key": flavor,
        "app_slug": profile.app_slug,
        "app_name": profile.app_name,
        "bundle_id_android": package,
        "bundle_id_ios": profile.bundle_id_ios,
        "logo": effective_logo(profile.logo, business.logo),
        "app_icon_url": str(meta.get("app_icon_url") or "").strip(),
        "icon_settings": settings,
        "primary_color": profile.primary_color,
        "secondary_color": profile.secondary_color,
        "bootstrap_url": f"{_public_api_base()}/mobile/bootstrap?flavor_key={flavor}",
        "eas_project_id": EAS_CUSTOMER_PROJECT_ID,
        "eas_android_sha1": EAS_ANDROID_SHA1,
        "firebase_project_id": FIREBASE_PROJECT_ID,
        "google_cloud_oauth_project": GOOGLE_CLOUD_OAUTH_PROJECT,
        "web_oauth_client_id": WEB_OAUTH_CLIENT_ID,
        "google_oauth_android_client_id": str(meta.get("google_oauth_android_client_id") or ""),
        "play_signing_sha1": str(meta.get("play_signing_sha1") or ""),
        "suggested_eas_profile_preview": "customer-production-preview",
        "suggested_eas_profile_production": "customer-production",
        "has_google_services_json": bool(meta.get("google_services_json")),
        "firebase_app_id": meta.get("firebase_app_id"),
        "preview": meta.get("preview") or {},
        "production": meta.get("production") or {},
        "live": meta.get("live") or {},
        "builds": meta.get("builds") or [],
    }


def customer_app_checklist(profile: WhiteLabelProfile) -> dict[str, Any]:
    recipe = customer_app_recipe(profile)
    white_label_ok = bool(
        profile.white_label_enabled
        and (profile.bundle_id_android or "").strip()
        and (profile.flavor_key or "").strip()
    )
    google_ok = bool(recipe["google_oauth_android_client_id"])
    firebase_ok = bool(recipe["has_google_services_json"])
    preview = recipe["preview"] if isinstance(recipe["preview"], dict) else {}
    production = recipe["production"] if isinstance(recipe["production"], dict) else {}
    live = recipe["live"] if isinstance(recipe["live"], dict) else {}
    preview_ready = str(preview.get("status") or "") == "finished"
    store_ready = str(production.get("status") or "") == "finished"
    submitted = bool(production.get("submitted_at") or production.get("submit_status") == "finished")
    is_live = bool(live.get("version_name") or live.get("marked_live_at"))
    ready_for_preview = white_label_ok and google_ok and firebase_ok
    if is_live:
        headline = "Live"
    elif submitted:
        headline = "Submitted"
    elif store_ready:
        headline = "Ready for store submit"
    elif preview_ready:
        headline = "Preview ready"
    elif ready_for_preview:
        headline = "Ready for preview"
    else:
        headline = "Not ready"
    return {
        "headline": headline,
        "white_label": white_label_ok,
        "google_sign_in": google_ok,
        "firebase": firebase_ok,
        "preview_apk": preview_ready,
        "store_aab": store_ready,
        "submitted": submitted,
        "live": is_live,
        "ready_for_preview": ready_for_preview,
        "ready_for_store": ready_for_preview and preview_ready,
    }


def serialize_customer_app(profile: WhiteLabelProfile) -> dict[str, Any]:
    fill_white_label_defaults(profile)
    profile.refresh_from_db()
    return {
        "profile": serialize_white_label_profile(profile),
        "recipe": customer_app_recipe(profile),
        "checklist": customer_app_checklist(profile),
    }


def upload_customer_app_branding_asset(
    *,
    profile: WhiteLabelProfile,
    uploaded_file,
    uploaded_by,
    kind: str = "logo",
) -> WhiteLabelProfile:
    """Platform-admin logo / optional app-icon upload into branding media."""
    from django.core.exceptions import ValidationError

    from apps.platform_media.models import MediaFolderType, MediaVisibility
    from apps.platform_media.services.media import MediaService

    kind_key = (kind or "logo").strip().lower()
    if kind_key not in {"logo", "app_icon"}:
        raise ValidationError("kind must be logo or app_icon.")

    business = profile.business
    tenant = business.tenant
    tags = ["branding", "logo"] if kind_key == "logo" else ["branding", "app-icon"]
    display = f"{business.display_name} {'logo' if kind_key == 'logo' else 'app icon'}"
    result = MediaService().upload(
        uploaded_file=uploaded_file,
        tenant=tenant,
        business=business,
        uploaded_by=uploaded_by,
        folder_type=MediaFolderType.BRANDING,
        visibility=MediaVisibility.PUBLIC,
        tags=tags,
        display_name=display,
    )
    file_url = str((result.media.metadata or {}).get("public_url") or f"/api/v1/media/{result.media.id}/file")
    if kind_key == "logo":
        profile.logo = file_url
        profile.white_label_enabled = True
        profile.save(update_fields=["logo", "white_label_enabled", "updated_at"])
        if business.logo != file_url:
            business.logo = file_url
            business.save(update_fields=["logo", "updated_at"])
    else:
        meta = _metadata(profile)
        meta["app_icon_url"] = file_url
        _save_metadata(profile, meta)
    profile.refresh_from_db()
    return profile


def update_customer_app_settings(
    *,
    profile: WhiteLabelProfile,
    app_name: str | None = None,
    bundle_id_android: str | None = None,
    bundle_id_ios: str | None = None,
    google_oauth_android_client_id: str | None = None,
    play_signing_sha1: str | None = None,
    app_icon_url: str | None = None,
    icon_mode: str | None = None,
    icon_background: str | None = None,
    icon_padding: float | int | str | None = None,
    splash_background: str | None = None,
    mark_live: bool | None = None,
) -> WhiteLabelProfile:
    if app_name is not None:
        profile.app_name = app_name.strip() or profile.app_name
    if bundle_id_android is not None:
        package = bundle_id_android.strip()
        if package:
            profile.bundle_id_android = package
            if not (profile.bundle_id_ios or "").strip():
                profile.bundle_id_ios = package
    if bundle_id_ios is not None and bundle_id_ios.strip():
        profile.bundle_id_ios = bundle_id_ios.strip()
    meta = _metadata(profile)
    if google_oauth_android_client_id is not None:
        meta["google_oauth_android_client_id"] = google_oauth_android_client_id.strip()
    if play_signing_sha1 is not None:
        meta["play_signing_sha1"] = play_signing_sha1.strip()
    if app_icon_url is not None:
        trimmed = app_icon_url.strip()
        if trimmed:
            meta["app_icon_url"] = trimmed
        else:
            meta.pop("app_icon_url", None)
    if icon_mode is not None:
        mode = str(icon_mode).strip().lower()
        meta["icon_mode"] = mode if mode in {"plate", "as-is"} else "plate"
    if icon_background is not None:
        primary = _normalize_hex_color(profile.primary_color, "#0F6CBD")
        meta["icon_background"] = _normalize_hex_color(icon_background, primary)
    if icon_padding is not None:
        meta["icon_padding"] = _normalize_icon_padding(icon_padding, 0.22)
    if splash_background is not None:
        primary = _normalize_hex_color(profile.primary_color, "#0F6CBD")
        meta["splash_background"] = _normalize_hex_color(splash_background, primary)
    if mark_live:
        production = meta.get("production") if isinstance(meta.get("production"), dict) else {}
        meta["live"] = {
            "version_name": production.get("version_name"),
            "version_code": production.get("version_code"),
            "marked_live_at": timezone.now().isoformat(),
            "build_id": production.get("build_id"),
            "url": production.get("url"),
        }
    profile.build_metadata = meta
    profile.save()
    return profile


def _clip_error_text(text: str, limit: int = 280) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1] + "…"


def _firebase_http_error_message(code: int, detail: str) -> str:
    parsed_msg = ""
    try:
        payload = json.loads(detail) if detail else {}
        err = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(err, dict):
            parsed_msg = str(err.get("message") or err.get("status") or "")
        elif isinstance(err, str):
            parsed_msg = err
    except json.JSONDecodeError:
        parsed_msg = ""
    snippet = _clip_error_text(parsed_msg or detail or "unknown error")
    if code == 403:
        return (
            f"Firebase denied access ({snippet}). Give the VPS service account "
            "Firebase Management Admin on project ie-orbit."
        )
    if code == 404:
        return f"Firebase project ie-orbit was not found ({snippet})."
    if code == 409:
        return f"A Firebase Android app already exists for this package ({snippet})."
    return f"Firebase API returned {code}: {snippet}"


def customer_app_action_error(exc: BaseException) -> tuple[int, str, str]:
    """Map a customer-app action failure to (status, code, message)."""
    message = _clip_error_text(str(exc).strip() or "The customer app action failed.", 400)
    lowered = message.lower()
    if any(
        token in lowered
        for token in (
            "not configured",
            "not readable",
            "not valid json",
            "could not sign in",
            "client libraries are missing",
        )
    ):
        return 503, "firebase_not_configured", message
    if "android package" in lowered:
        return 400, "firebase_package_required", message
    if "could not reach firebase" in lowered:
        return 503, "firebase_unreachable", message
    if "create the firebase app first" in lowered:
        return 400, "firebase_required", message
    if "oauth" in lowered and "client" in lowered:
        return 400, "google_oauth_required", message
    if "firebase" in lowered:
        return 502, "firebase_failed", message
    return 400, "customer_app_action_failed", message


def _firebase_access_token() -> str:
    raw = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not raw:
        candidates = [
            (os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or "").strip(),
            "/run/secrets/firebase-management.json",
        ]
        for path in candidates:
            if path and os.path.isfile(path):
                try:
                    file_raw = open(path, encoding="utf-8").read().strip()
                except OSError as exc:
                    raise RuntimeError(
                        "Firebase credentials file is not readable. On the VPS run "
                        "chmod 644 secrets/firebase-management.json so the backend "
                        f"app user can read it ({exc})."
                    ) from exc
                if file_raw:
                    raw = file_raw
                    break
    if not raw:
        raise RuntimeError(
            "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON on the VPS "
            "or mount secrets/firebase-management.json and set "
            "GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-management.json "
            "(Firebase Management Admin for project ie-orbit)."
        )
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "Firebase credentials on the VPS are not valid JSON. Check "
            "FIREBASE_SERVICE_ACCOUNT_JSON or the mounted service-account file."
        ) from exc
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError as exc:
        raise RuntimeError(
            "Firebase client libraries are missing on the server. Rebuild the backend image."
        ) from exc
    try:
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=[
                "https://www.googleapis.com/auth/firebase",
                "https://www.googleapis.com/auth/cloud-platform",
            ],
        )
        credentials.refresh(Request())
    except Exception as exc:
        raise RuntimeError(
            "Could not sign in to Firebase with the VPS service account: "
            f"{_clip_error_text(str(exc), 180)}"
        ) from exc
    return credentials.token


def _http_json(
    *,
    method: str,
    url: str,
    token: str,
    body: dict | None = None,
) -> dict[str, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.warning("Firebase API %s %s: %s", method, url, detail[:1000])
        raise RuntimeError(_firebase_http_error_message(exc.code, detail)) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(
            f"Could not reach Firebase ({reason}). "
            "Check that the VPS can make outbound HTTPS calls."
        ) from exc


def provision_firebase_android_app(*, profile: WhiteLabelProfile) -> dict[str, Any]:
    fill_white_label_defaults(profile)
    package = (profile.bundle_id_android or "").strip()
    if not package:
        raise RuntimeError("Set an Android package before creating the Firebase app.")
    token = _firebase_access_token()
    project = FIREBASE_PROJECT_ID
    listed = _http_json(
        method="GET",
        url=f"https://firebase.googleapis.com/v1beta1/projects/{project}/androidApps",
        token=token,
    )
    apps = listed.get("apps") or []
    existing = next((app for app in apps if app.get("packageName") == package), None)
    if existing is None:
        operation = _http_json(
            method="POST",
            url=f"https://firebase.googleapis.com/v1beta1/projects/{project}/androidApps",
            token=token,
            body={"packageName": package, "displayName": profile.app_name or package},
        )
        # Poll operation until app name is present.
        op_name = operation.get("name")
        app_resource = operation.get("response") or {}
        for _ in range(20):
            if app_resource.get("appId") or app_resource.get("name"):
                break
            if not op_name:
                break
            status = _http_json(
                method="GET",
                url=f"https://firebase.googleapis.com/v1beta1/{op_name}",
                token=token,
            )
            if status.get("done"):
                app_resource = status.get("response") or {}
                break
        existing = app_resource
    app_id = existing.get("appId") or ""
    app_name = existing.get("name") or ""
    if not app_id and not app_name:
        raise RuntimeError(
            "Firebase did not return an Android app id. "
            "Wait a few seconds and click Refresh Firebase app."
        )
    app_name = app_name or f"projects/{project}/androidApps/{app_id}"
    # Add EAS SHA-1 (ignore if already present).
    try:
        _http_json(
            method="POST",
            url=f"https://firebase.googleapis.com/v1beta1/{app_name}/sha",
            token=token,
            body={"shaHash": EAS_ANDROID_SHA1.replace(":", ""), "certType": "SHA_1"},
        )
    except RuntimeError as exc:
        if "ALREADY_EXISTS" not in str(exc) and "409" not in str(exc):
            # Firebase accepts hashes with or without colons; retry colon form.
            try:
                _http_json(
                    method="POST",
                    url=f"https://firebase.googleapis.com/v1beta1/{app_name}/sha",
                    token=token,
                    body={"shaHash": EAS_ANDROID_SHA1, "certType": "SHA_1"},
                )
            except RuntimeError as inner:
                if "ALREADY_EXISTS" not in str(inner) and "409" not in str(inner):
                    raise
    play_sha = str(_metadata(profile).get("play_signing_sha1") or "").strip()
    if play_sha:
        try:
            _http_json(
                method="POST",
                url=f"https://firebase.googleapis.com/v1beta1/{app_name}/sha",
                token=token,
                body={"shaHash": play_sha.replace(":", ""), "certType": "SHA_1"},
            )
        except RuntimeError:
            pass
    config = _http_json(
        method="GET",
        url=f"https://firebase.googleapis.com/v1beta1/{app_name}/config",
        token=token,
    )
    # configFileContents is base64.
    encoded = config.get("configFileContents") or ""
    if encoded:
        google_services = base64.b64decode(encoded).decode("utf-8")
    else:
        raise RuntimeError("Firebase did not return google-services.json contents.")
    meta = _metadata(profile)
    meta["firebase_app_id"] = app_id
    meta["firebase_app_name"] = app_name
    meta["google_services_json"] = google_services
    meta["firebase_provisioned_at"] = timezone.now().isoformat()
    _save_metadata(profile, meta)
    return {
        "firebase_app_id": app_id,
        "package_name": package,
        "has_google_services_json": True,
    }


def machine_build_payload(*, profile: WhiteLabelProfile, track: str) -> dict[str, Any]:
    fill_white_label_defaults(profile)
    meta = _metadata(profile)
    google_json = meta.get("google_services_json") or ""
    android_client = str(meta.get("google_oauth_android_client_id") or "")
    if track not in {"preview", "production"}:
        raise RuntimeError("track must be preview or production")
    if not google_json:
        raise RuntimeError("Create the Firebase app first.")
    if not android_client:
        raise RuntimeError("Paste the Google Android OAuth client id first.")
    business = profile.business
    tenant = business.tenant
    frontend_base = str(
        getattr(settings, "FRONTEND_BASE_URL", "https://ie-orbit.com") or "https://ie-orbit.com"
    ).rstrip("/")
    env = {
        "EXPO_PUBLIC_FLAVOR_KEY": profile.flavor_key,
        "EXPO_PUBLIC_APP_NAME": profile.app_name,
        "EXPO_PUBLIC_APP_SLUG": profile.app_slug,
        "EXPO_PUBLIC_BUNDLE_ID_ANDROID": profile.bundle_id_android,
        "EXPO_PUBLIC_BUNDLE_ID_IOS": profile.bundle_id_ios or profile.bundle_id_android,
        "EXPO_PUBLIC_TENANT_SLUG": tenant.slug,
        "EXPO_PUBLIC_BUSINESS_CODE": business.business_code,
        "EXPO_PUBLIC_PRIMARY_COLOR": profile.primary_color,
        "EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID": android_client,
        "EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID": WEB_OAUTH_CLIENT_ID,
        "EXPO_PUBLIC_API_BASE_URL": _public_api_base(),
        "EXPO_PUBLIC_REFERRAL_LINK_BASE_URL": frontend_base,
        "EXPO_PUBLIC_APP_DOWNLOAD_URL": f"{frontend_base}/download",
        "EXPO_PUBLIC_EAS_PROJECT_ID": EAS_CUSTOMER_PROJECT_ID,
        "GOOGLE_SERVICES_JSON": google_json,
    }
    app_icon_url = str(meta.get("app_icon_url") or "").strip()
    if app_icon_url:
        if app_icon_url.startswith("/"):
            app_icon_url = f"{_public_api_base().removesuffix('/api/v1')}{app_icon_url}"
        env["EXPO_PUBLIC_APP_ICON_URL"] = app_icon_url
    icon_config = icon_settings_from_profile(profile)
    env["EXPO_PUBLIC_ICON_MODE"] = icon_config["mode"]
    env["EXPO_PUBLIC_ICON_BACKGROUND"] = icon_config["background"]
    env["EXPO_PUBLIC_IOS_ICON_BACKGROUND"] = icon_config["background"]
    env["EXPO_PUBLIC_ICON_PADDING"] = str(icon_config["padding"])
    env["EXPO_PUBLIC_SPLASH_BACKGROUND"] = icon_config["splash_background"]
    return {
        "track": track,
        "eas_profile": "customer-production-preview" if track == "preview" else "customer-production",
        "env": env,
    }


def _append_build_history(meta: dict[str, Any], entry: dict[str, Any]) -> None:
    history = list(meta.get("builds") or [])
    history.insert(0, entry)
    meta["builds"] = history[:10]


def dispatch_customer_app_build(
    *,
    profile: WhiteLabelProfile,
    track: str,
    bump: str = "patch",
) -> dict[str, Any]:
    payload = machine_build_payload(profile=profile, track=track)
    meta = _metadata(profile)
    now = timezone.now().isoformat()
    track_key = "preview" if track == "preview" else "production"
    entry = {
        "track": track,
        "status": "queued",
        "bump": bump,
        "started_at": now,
        "eas_profile": payload["eas_profile"],
    }
    meta[track_key] = {**(meta.get(track_key) if isinstance(meta.get(track_key), dict) else {}), **entry}
    _append_build_history(meta, entry)
    _save_metadata(profile, meta)

    repo = (os.getenv("CUSTOMER_APK_GITHUB_REPO") or os.getenv("GITHUB_REPOSITORY") or "").strip()
    token = (os.getenv("CUSTOMER_APK_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN") or "").strip()
    workflow = (os.getenv("CUSTOMER_APK_WORKFLOW") or "customer-apk.yml").strip()
    if not repo or not token:
        meta[track_key]["status"] = "errored"
        meta[track_key]["error"] = (
            "Build dispatch is not configured. Set CUSTOMER_APK_GITHUB_REPO and "
            "CUSTOMER_APK_GITHUB_TOKEN on the VPS."
        )
        _save_metadata(profile, meta)
        raise RuntimeError(meta[track_key]["error"])

    body = {
        "ref": os.getenv("CUSTOMER_APK_GITHUB_REF") or "main",
        "inputs": {
            "business_id": str(profile.business_id),
            "track": track,
            "bump": bump,
            "api_base": _public_api_base(),
        },
    }
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/actions/workflows/{workflow}/dispatches",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "ie-orbit-platform-admin",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status not in {201, 204}:
                raise RuntimeError(f"GitHub dispatch returned {response.status}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        meta[track_key]["status"] = "errored"
        meta[track_key]["error"] = f"GitHub dispatch failed: {detail}"
        _save_metadata(profile, meta)
        raise RuntimeError(meta[track_key]["error"]) from exc

    meta[track_key]["status"] = "in_progress"
    meta[track_key]["github_dispatched_at"] = timezone.now().isoformat()
    _save_metadata(profile, meta)
    return {"track": track, "status": "in_progress", "eas_profile": payload["eas_profile"]}


def record_build_callback(
    *,
    profile: WhiteLabelProfile,
    track: str,
    status: str,
    build_id: str | None = None,
    url: str | None = None,
    apk_url: str | None = None,
    version_name: str | None = None,
    version_code: int | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    track_key = "preview" if track == "preview" else "production"
    meta = _metadata(profile)
    current = dict(meta.get(track_key) if isinstance(meta.get(track_key), dict) else {})
    current.update(
        {
            "status": status,
            "updated_at": timezone.now().isoformat(),
        }
    )
    if build_id:
        current["build_id"] = build_id
    if url:
        current["url"] = url
    if apk_url:
        current["apk_url"] = apk_url
    if version_name:
        current["version_name"] = version_name
    if version_code is not None:
        current["version_code"] = version_code
    if error:
        current["error"] = error
    meta[track_key] = current
    _append_build_history(
        meta,
        {
            "track": track,
            "status": status,
            "build_id": build_id,
            "url": url,
            "apk_url": apk_url,
            "version_name": version_name,
            "version_code": version_code,
            "at": timezone.now().isoformat(),
            "error": error,
        },
    )
    _save_metadata(profile, meta)
    return current


def refresh_build_status_from_expo(*, profile: WhiteLabelProfile, track: str) -> dict[str, Any]:
    """Optional poll using EXPO_TOKEN / EXPO_ACCESS_TOKEN when a build_id is known."""
    track_key = "preview" if track == "preview" else "production"
    meta = _metadata(profile)
    current = dict(meta.get(track_key) if isinstance(meta.get(track_key), dict) else {})
    build_id = str(current.get("build_id") or "").strip()
    token = (os.getenv("EXPO_TOKEN") or getattr(settings, "EXPO_ACCESS_TOKEN", "") or "").strip()
    if not build_id or not token:
        return current
    query = (
        "query ($id: ID!) { builds { byId(buildId: $id) { id status "
        "appVersion appBuildVersion platform "
        "artifacts { buildUrl } } } }"
    )
    # Expo GraphQL shape varies; keep this best-effort.
    body = {"query": query, "variables": {"id": build_id}}
    request = urllib.request.Request(
        "https://api.expo.dev/graphql",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return current
    build = (((payload.get("data") or {}).get("builds") or {}).get("byId")) or {}
    if not build:
        return current
    status_map = {
        "NEW": "queued",
        "IN_QUEUE": "queued",
        "IN_PROGRESS": "in_progress",
        "FINISHED": "finished",
        "ERRORED": "errored",
        "CANCELED": "errored",
    }
    mapped = status_map.get(str(build.get("status") or "").upper(), current.get("status"))
    artifacts = build.get("artifacts") or {}
    return record_build_callback(
        profile=profile,
        track=track,
        status=str(mapped),
        build_id=str(build.get("id") or build_id),
        url=f"https://expo.dev/accounts/indians-empire/projects/ie-orbit-customer/builds/{build_id}",
        apk_url=artifacts.get("buildUrl"),
        version_name=build.get("appVersion"),
        version_code=int(build["appBuildVersion"]) if str(build.get("appBuildVersion") or "").isdigit() else None,
    )
