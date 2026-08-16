from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.api.utils import client_ip, user_agent
from apps.authentication.permissions import IsPlatformAdmin
from apps.common.api.responses import success_response
from apps.platform_admin.affiliate_service import AffiliateService
from apps.platform_admin.models import (
    PlatformAffiliate,
    PlatformAffiliateCode,
    PlatformPayout,
    PlatformReferral,
    PlatformReferralAccrual,
)


def _aff() -> AffiliateService:
    return AffiliateService()


class PlatformAffiliatesView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def get(self, request: Request) -> Response:
        rows = PlatformAffiliate.objects.prefetch_related("codes").all().order_by("name")[:200]
        return success_response(
            {"affiliates": [_aff().serialize_affiliate(row) for row in rows]}
        )

    @extend_schema(tags=["Platform Affiliates"])
    def post(self, request: Request) -> Response:
        data = request.data
        row = _aff().upsert_affiliate(
            actor=request.user,
            affiliate_id=data.get("id"),
            affiliate_type=data.get("affiliate_type") or data.get("type") or "partner",
            tenant_id=data.get("tenant_id"),
            name=data.get("name", ""),
            email=data.get("email", ""),
            status=data.get("status", "active"),
            payout_method=data.get("payout_method", ""),
            upi_vpa=data.get("upi_vpa", ""),
            bank_account_name=data.get("bank_account_name", ""),
            bank_account_number=data.get("bank_account_number", ""),
            bank_ifsc=data.get("bank_ifsc", ""),
            payout_notes=data.get("payout_notes", ""),
            metadata=data.get("metadata") or {},
            reason=data.get("reason", "affiliate upsert"),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(_aff().serialize_affiliate(row), status_code=201)


class PlatformAffiliateCodesView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def get(self, request: Request) -> Response:
        qs = PlatformAffiliateCode.objects.select_related("affiliate").all().order_by("code")
        affiliate_id = request.query_params.get("affiliate_id")
        if affiliate_id:
            qs = qs.filter(affiliate_id=affiliate_id)
        return success_response({"codes": [_aff().serialize_code(row) for row in qs[:200]]})

    @extend_schema(tags=["Platform Affiliates"])
    def post(self, request: Request) -> Response:
        data = request.data
        row = _aff().upsert_code(
            actor=request.user,
            affiliate_id=str(data.get("affiliate_id") or ""),
            code=str(data.get("code") or ""),
            is_active=bool(data.get("is_active", True)),
            reason=data.get("reason", "affiliate code upsert"),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(_aff().serialize_code(row), status_code=201)


class PlatformAffiliateDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def delete(self, request: Request, affiliate_id: str) -> Response:
        reason = ""
        if isinstance(getattr(request, "data", None), dict):
            reason = str(request.data.get("reason") or "")
        if not reason:
            reason = str(request.query_params.get("reason") or "delete affiliate")
        _aff().delete_affiliate(
            actor=request.user,
            affiliate_id=str(affiliate_id),
            reason=reason,
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response({"deleted": True})


class PlatformAffiliateCodeDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def delete(self, request: Request, code_id: str) -> Response:
        reason = ""
        if isinstance(getattr(request, "data", None), dict):
            reason = str(request.data.get("reason") or "")
        if not reason:
            reason = str(request.query_params.get("reason") or "delete affiliate code")
        _aff().delete_code(
            actor=request.user,
            code_id=str(code_id),
            reason=reason,
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response({"deleted": True})


class PlatformAffiliateReferralsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def get(self, request: Request) -> Response:
        qs = PlatformReferral.objects.select_related("affiliate", "referred_tenant").all()
        affiliate_id = request.query_params.get("affiliate_id")
        if affiliate_id:
            qs = qs.filter(affiliate_id=affiliate_id)
        return success_response(
            {"referrals": [_aff().serialize_referral(row) for row in qs.order_by("-starts_at")[:200]]}
        )


class PlatformAffiliateAccrualsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def get(self, request: Request) -> Response:
        qs = PlatformReferralAccrual.objects.select_related("referral").all()
        referral_id = request.query_params.get("referral_id")
        if referral_id:
            qs = qs.filter(referral_id=referral_id)
        return success_response(
            {"accruals": [_aff().serialize_accrual(row) for row in qs.order_by("-period_yyyy_mm")[:200]]}
        )

    @extend_schema(tags=["Platform Affiliates"])
    def post(self, request: Request) -> Response:
        data = request.data
        referral = get_object_or_404(PlatformReferral, id=data.get("referral_id"))
        accrual = _aff().accrue_monthly(
            referral=referral,
            period_yyyy_mm=str(data.get("period_yyyy_mm") or ""),
            amount_paise=int(data.get("amount_paise") or 0),
            benefit_type=str(data.get("benefit_type") or "credit"),
            actor=request.user,
            reason=data.get("reason", "monthly accrual"),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(_aff().serialize_accrual(accrual), status_code=201)


class PlatformAffiliateAccrualCreditView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def post(self, request: Request, accrual_id: str) -> Response:
        accrual = get_object_or_404(PlatformReferralAccrual, id=accrual_id)
        row = _aff().approve_accrual_as_credit(
            accrual=accrual,
            actor=request.user,
            reason=request.data.get("reason", "approve accrual as credit"),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(_aff().serialize_accrual(row))


class PlatformAffiliateAccrualPayoutView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def post(self, request: Request, accrual_id: str) -> Response:
        accrual = get_object_or_404(PlatformReferralAccrual, id=accrual_id)
        payout = _aff().approve_accrual_as_payout(
            accrual=accrual,
            actor=request.user,
            reason=request.data.get("reason", "approve accrual as payout"),
            payment_ref=request.data.get("payment_ref", ""),
            notes=request.data.get("notes", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(_aff().serialize_payout(payout), status_code=201)


class PlatformAffiliatePayoutsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def get(self, request: Request) -> Response:
        qs = PlatformPayout.objects.select_related("affiliate").all().order_by("-created_at")
        affiliate_id = request.query_params.get("affiliate_id")
        if affiliate_id:
            qs = qs.filter(affiliate_id=affiliate_id)
        return success_response({"payouts": [_aff().serialize_payout(row) for row in qs[:200]]})


class PlatformAffiliatePayoutMarkPaidView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Affiliates"])
    def post(self, request: Request, payout_id: str) -> Response:
        payout = get_object_or_404(PlatformPayout, id=payout_id)
        row = _aff().mark_payout_paid(
            payout=payout,
            actor=request.user,
            reason=request.data.get("reason", "mark payout paid"),
            payment_ref=request.data.get("payment_ref", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(_aff().serialize_payout(row))
