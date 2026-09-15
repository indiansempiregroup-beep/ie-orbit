from __future__ import annotations

import os
from collections import defaultdict

from django.db.models import Count
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.permissions import IsPlatformAdmin
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.businesses.api.white_label_serializers import (
    WhiteLabelProfileSerializer,
    WhiteLabelProfileUpsertSerializer,
)
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    WhiteLabelProfile,
)
from apps.businesses.services.entitlements import (
    EntitlementService,
    ordered_product_subscriptions,
    subscription_billing_state,
)
from apps.businesses.services.customer_app_build import (
    dispatch_customer_app_build,
    ensure_customer_app_profile,
    machine_build_payload,
    provision_firebase_android_app,
    record_build_callback,
    refresh_build_status_from_expo,
    serialize_customer_app,
    update_customer_app_settings,
)
from apps.businesses.services.white_label import (
    ensure_white_label_profile,
    serialize_white_label_profile,
)
from apps.common.api.responses import success_response
from apps.tenancy.models import Tenant


def _summarize_tenant_billing(
    subscriptions: list[BusinessProductSubscription],
) -> tuple[str, str | None, str | None]:
    if not subscriptions:
        return "none", None, None
    states = [subscription_billing_state(item) for item in subscriptions]
    if "soft_locked" in states:
        chosen_state = "soft_locked"
    elif "paying" in states:
        chosen_state = "paying"
    elif "complimentary" in states:
        chosen_state = "complimentary"
    elif "trialing" in states:
        chosen_state = "trialing"
    elif "canceled" in states:
        chosen_state = "canceled"
    else:
        chosen_state = states[0]
    chosen = next(
        (item for item in subscriptions if subscription_billing_state(item) == chosen_state),
        subscriptions[0],
    )
    plan_code = chosen.plan.code if chosen.plan_id else None
    return chosen_state, plan_code, chosen.product_code


def _product_summaries(subscriptions: list[BusinessProductSubscription]) -> list[dict]:
    rows = []
    for subscription in ordered_product_subscriptions(subscriptions):
        rows.append(
            {
                "product_code": subscription.product_code,
                "plan_code": subscription.plan.code if subscription.plan_id else None,
                "billing_state": subscription_billing_state(subscription),
            }
        )
    return rows


def _business_admin_billing(business: Business, entitlements: EntitlementService) -> tuple[dict, list[dict]]:
    billings = entitlements.billing_snapshots(business=business)
    selected = (business.selected_product or "").strip().lower()
    billing = next((row for row in billings if row.get("product_code") == selected), None)
    if billing is None and billings:
        billing = billings[0]
    if billing is None:
        product_code = selected or "appointie"
        billing = entitlements.billing_snapshot(business=business, product_code=product_code)
    return billing, billings


class PlatformWhiteLabelListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"], responses={200: WhiteLabelProfileSerializer(many=True)})
    def get(self, request: Request) -> Response:
        for business in Business.active_objects.select_related("tenant"):
            ensure_white_label_profile(business=business)
        profiles = (
            WhiteLabelProfile.active_objects.select_related("business", "tenant").order_by("app_name")
        )
        return success_response(
            WhiteLabelProfileSerializer(profiles, many=True).data,
            request_id=getattr(request, "request_id", None),
        )


class PlatformWhiteLabelDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def _get_business(self, business_id: str) -> Business:
        return get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)

    @extend_schema(tags=["Platform Admin"], responses={200: dict})
    def get(self, request: Request, business_id: str) -> Response:
        business = self._get_business(business_id)
        profile = ensure_white_label_profile(business=business)
        return success_response(
            serialize_white_label_profile(profile),
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Platform Admin"], request=WhiteLabelProfileUpsertSerializer, responses={200: dict})
    def patch(self, request: Request, business_id: str) -> Response:
        business = self._get_business(business_id)
        profile = ensure_white_label_profile(business=business)
        serializer = WhiteLabelProfileUpsertSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            serialize_white_label_profile(profile),
            request_id=getattr(request, "request_id", None),
        )


class PlatformTenantAdminListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        tenants = list(Tenant.objects.select_related("owner").order_by("display_name"))
        tenant_ids = [tenant.id for tenant in tenants]
        business_counts = {
            row["tenant_id"]: row["count"]
            for row in Business.active_objects.filter(tenant_id__in=tenant_ids)
            .values("tenant_id")
            .annotate(count=Count("id"))
        }
        subscriptions_by_tenant: dict = defaultdict(list)
        for subscription in BusinessProductSubscription.objects.filter(
            tenant_id__in=tenant_ids
        ).select_related("plan"):
            subscriptions_by_tenant[subscription.tenant_id].append(subscription)

        last_paid: dict = {}
        paid_rows = (
            BillingCheckoutSession.objects.filter(
                tenant_id__in=tenant_ids,
                status=CheckoutSessionStatus.PAID,
            )
            .order_by("tenant_id", "-paid_at", "-created_at")
            .values("tenant_id", "amount_paise", "paid_at", "created_at")
        )
        for row in paid_rows:
            if row["tenant_id"] not in last_paid:
                last_paid[row["tenant_id"]] = row

        pending_claims = {
            row["tenant_id"]: row["count"]
            for row in BillingCheckoutSession.objects.filter(
                tenant_id__in=tenant_ids,
                metadata__payment_status="awaiting_confirmation",
            )
            .values("tenant_id")
            .annotate(count=Count("id"))
        }

        rows = []
        for tenant in tenants:
            tenant_subscriptions = subscriptions_by_tenant.get(tenant.id, [])
            billing_state, plan_code, product_code = _summarize_tenant_billing(tenant_subscriptions)
            payment = last_paid.get(tenant.id)
            paid_at = payment.get("paid_at") or payment.get("created_at") if payment else None
            rows.append(
                {
                    "id": str(tenant.id),
                    "slug": tenant.slug,
                    "display_name": tenant.display_name,
                    "status": tenant.status,
                    "owner_email": tenant.owner.email if tenant.owner_id else None,
                    "business_count": business_counts.get(tenant.id, 0),
                    "primary_color": tenant.primary_color,
                    "created_at": tenant.created_at.isoformat(),
                    "billing_state": billing_state,
                    "plan_code": plan_code,
                    "product_code": product_code,
                    "products": _product_summaries(tenant_subscriptions),
                    "last_paid_at": paid_at.isoformat() if paid_at else None,
                    "last_paid_paise": payment["amount_paise"] if payment else None,
                    "pending_claims": int(pending_claims.get(tenant.id, 0)),
                }
            )
        return success_response({"tenants": rows}, request_id=getattr(request, "request_id", None))


class PlatformTenantAdminDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        businesses = (
            Business.objects.filter(tenant=tenant)
            .select_related("white_label_profile")
            .prefetch_related("product_subscriptions__plan")
            .order_by("display_name")
        )
        entitlements = EntitlementService()
        business_rows = []
        for business in businesses:
            profile = getattr(business, "white_label_profile", None)
            billing, billings = _business_admin_billing(business, entitlements)
            business_rows.append(
                {
                    "id": str(business.id),
                    "business_code": business.business_code,
                    "display_name": business.display_name,
                    "status": business.status,
                    "selected_product": business.selected_product,
                    "has_white_label_profile": profile is not None,
                    "flavor_key": profile.flavor_key if profile else None,
                    "bundle_id_android": profile.bundle_id_android if profile else None,
                    "app_name": profile.app_name if profile else None,
                    "billing": billing,
                    "billings": billings,
                }
            )
        return success_response(
            {
                "id": str(tenant.id),
                "slug": tenant.slug,
                "display_name": tenant.display_name,
                "status": tenant.status,
                "businesses": business_rows,
            },
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Platform Admin"])
    def patch(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        status_value = request.data.get("status")
        if status_value:
            from apps.platform_admin.services import PlatformAdminService

            PlatformAdminService().set_tenant_status(
                tenant=tenant,
                status=status_value,
                actor=request.user,
                reason=request.data.get("reason") or f"status set to {status_value}",
            )
            tenant.refresh_from_db()
        return success_response(
            {
                "id": str(tenant.id),
                "slug": tenant.slug,
                "display_name": tenant.display_name,
                "status": tenant.status,
            },
            request_id=getattr(request, "request_id", None),
        )


class PlatformCustomerAppView(APIView):
    """Customer white-label recipe + checklist for Platform Admin."""

    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def _get_business(self, business_id: str) -> Business:
        return get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, business_id: str) -> Response:
        business = self._get_business(business_id)
        profile = ensure_customer_app_profile(business=business)
        return success_response(
            serialize_customer_app(profile),
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Platform Admin"])
    def patch(self, request: Request, business_id: str) -> Response:
        business = self._get_business(business_id)
        profile = ensure_customer_app_profile(business=business)
        data = request.data if isinstance(request.data, dict) else {}
        update_customer_app_settings(
            profile=profile,
            app_name=data.get("app_name"),
            bundle_id_android=data.get("bundle_id_android"),
            bundle_id_ios=data.get("bundle_id_ios"),
            google_oauth_android_client_id=data.get("google_oauth_android_client_id"),
            play_signing_sha1=data.get("play_signing_sha1"),
            mark_live=bool(data.get("mark_live")),
        )
        # Also allow classic white-label fields via existing serializer when present.
        wl_fields = {
            key: data[key]
            for key in (
                "flavor_key",
                "app_slug",
                "logo",
                "primary_color",
                "secondary_color",
                "white_label_enabled",
            )
            if key in data
        }
        if wl_fields:
            serializer = WhiteLabelProfileUpsertSerializer(profile, data=wl_fields, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
        profile.refresh_from_db()
        return success_response(
            serialize_customer_app(profile),
            request_id=getattr(request, "request_id", None),
        )


class PlatformCustomerAppFirebaseView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, business_id: str) -> Response:
        business = get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)
        profile = ensure_customer_app_profile(business=business)
        try:
            result = provision_firebase_android_app(profile=profile)
        except RuntimeError as exc:
            return success_response(
                {"ok": False, "error": str(exc), **serialize_customer_app(profile)},
                request_id=getattr(request, "request_id", None),
            )
        return success_response(
            {"ok": True, **result, **serialize_customer_app(profile)},
            request_id=getattr(request, "request_id", None),
        )


class PlatformCustomerAppBuildView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, business_id: str) -> Response:
        business = get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)
        profile = ensure_customer_app_profile(business=business)
        data = request.data if isinstance(request.data, dict) else {}
        track = str(data.get("track") or "preview").strip().lower()
        bump = str(data.get("bump") or "patch").strip().lower()
        try:
            result = dispatch_customer_app_build(profile=profile, track=track, bump=bump)
        except RuntimeError as exc:
            return success_response(
                {"ok": False, "error": str(exc), **serialize_customer_app(profile)},
                request_id=getattr(request, "request_id", None),
            )
        return success_response(
            {"ok": True, **result, **serialize_customer_app(profile)},
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, business_id: str) -> Response:
        business = get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)
        profile = ensure_customer_app_profile(business=business)
        track = str(request.query_params.get("track") or "preview").strip().lower()
        refresh_build_status_from_expo(profile=profile, track=track)
        profile.refresh_from_db()
        return success_response(
            serialize_customer_app(profile),
            request_id=getattr(request, "request_id", None),
        )


class PlatformCustomerAppMachineView(APIView):
    """CI machine endpoint: fetch env for EAS or report build results."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def _authorize(self, request: Request) -> bool:
        expected = (os.getenv("CUSTOMER_APK_MACHINE_TOKEN") or "").strip()
        if not expected:
            return False
        header = request.headers.get("Authorization") or ""
        token = header.removeprefix("Bearer ").strip()
        return token == expected

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, business_id: str) -> Response:
        if not self._authorize(request):
            return Response({"error": "Unauthorized"}, status=401)
        business = get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)
        profile = ensure_customer_app_profile(business=business)
        track = str(request.query_params.get("track") or "preview").strip().lower()
        try:
            payload = machine_build_payload(profile=profile, track=track)
        except RuntimeError as exc:
            return Response({"error": str(exc)}, status=400)
        return success_response(payload, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, business_id: str) -> Response:
        if not self._authorize(request):
            return Response({"error": "Unauthorized"}, status=401)
        business = get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)
        profile = ensure_customer_app_profile(business=business)
        data = request.data if isinstance(request.data, dict) else {}
        track = str(data.get("track") or "preview").strip().lower()
        version_code = data.get("version_code")
        try:
            version_code_int = int(version_code) if version_code is not None else None
        except (TypeError, ValueError):
            version_code_int = None
        record_build_callback(
            profile=profile,
            track=track,
            status=str(data.get("status") or "in_progress"),
            build_id=data.get("build_id"),
            url=data.get("url"),
            apk_url=data.get("apk_url"),
            version_name=data.get("version_name"),
            version_code=version_code_int,
            error=data.get("error"),
        )
        return success_response(
            serialize_customer_app(profile),
            request_id=getattr(request, "request_id", None),
        )
