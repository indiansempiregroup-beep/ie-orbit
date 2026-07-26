from __future__ import annotations

import csv
import io
import re
from uuid import uuid4

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.api.utils import client_ip, user_agent
from apps.authentication.api.serializers import UserProfileSerializer
from apps.authentication.models import User
from apps.authentication.permissions import IsPlatformAdmin
from apps.businesses.models import Business
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.entitlements import EntitlementService
from apps.common.api.responses import success_response
from apps.platform_admin.models import (
    HelpArticle,
    PlatformAnnouncement,
    PlatformAuditEvent,
    PlatformCoupon,
    PlatformLedgerInvoice,
    SupportTicket,
    SupportTicketNote,
)
from apps.platform_admin.services import PlatformAdminService
from apps.tenancy.models import Tenant, TenantStatus
from apps.tenancy.repositories import TenantRepository
from apps.tenancy.services.tenants import TenantService


def _svc() -> PlatformAdminService:
    return PlatformAdminService()


class PlatformTenantActionView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, tenant_id: str, action: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        mapping = {
            "suspend": TenantStatus.SUSPENDED,
            "reactivate": TenantStatus.ACTIVE,
            "archive": TenantStatus.ARCHIVED,
        }
        if action not in mapping:
            return Response({"error": {"message": "Unknown action"}}, status=400)
        tenant = _svc().set_tenant_status(
            tenant=tenant,
            status=mapping[action],
            actor=request.user,
            reason=request.data.get("reason", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(
            {"id": str(tenant.id), "status": tenant.status},
            request_id=getattr(request, "request_id", None),
        )


class PlatformTenantBillingView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        business = _svc().primary_business(tenant)
        product_code = request.query_params.get("product_code") or business.selected_product or "appointie"
        snapshot = EntitlementService().billing_snapshot(business=business, product_code=product_code)
        return success_response(
            {"tenant_id": str(tenant.id), "business_id": str(business.id), "billing": snapshot},
            request_id=getattr(request, "request_id", None),
        )


class PlatformTenantBillingActionView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        action = request.data.get("action")
        if not action:
            return Response({"error": {"message": "action is required"}}, status=400)
        billing = _svc().billing_action(
            tenant=tenant,
            actor=request.user,
            action=action,
            payload=request.data,
            reason=request.data.get("reason", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response({"billing": billing}, request_id=getattr(request, "request_id", None))


class PlatformTenantUsersView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        return success_response(
            {"users": _svc().tenant_users(tenant=tenant)},
            request_id=getattr(request, "request_id", None),
        )


class PlatformUserSearchView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        return success_response(
            {"users": _svc().search_users(email=request.query_params.get("email", ""))},
            request_id=getattr(request, "request_id", None),
        )


class PlatformUserActionView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, user_id: str, action: str) -> Response:
        user = get_object_or_404(User.objects.all(), id=user_id)
        svc = _svc()
        if action == "disable":
            user = svc.set_user_active(
                user=user,
                active=False,
                actor=request.user,
                reason=request.data.get("reason", ""),
                ip_address=client_ip(request),
                user_agent=user_agent(request),
            )
            return success_response({"id": str(user.id), "is_active": user.is_active})
        if action == "enable":
            user = svc.set_user_active(
                user=user,
                active=True,
                actor=request.user,
                reason=request.data.get("reason", ""),
                ip_address=client_ip(request),
                user_agent=user_agent(request),
            )
            return success_response({"id": str(user.id), "is_active": user.is_active})
        if action == "reset_password":
            result = svc.reset_user_password(
                user=user,
                actor=request.user,
                reason=request.data.get("reason", ""),
                ip_address=client_ip(request),
                user_agent=user_agent(request),
            )
            return success_response(result)
        return Response({"error": {"message": "Unknown action"}}, status=400)


class PlatformImpersonateView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        user_id = request.data.get("user_id")
        reason = request.data.get("reason", "")
        svc = _svc()
        reason = svc.require_reason(reason)
        if user_id:
            target = get_object_or_404(User.objects.all(), id=user_id)
        else:
            target = tenant.owner
        if target is None:
            return Response({"error": {"message": "No user to impersonate"}}, status=400)
        if target.is_superuser or target.user_roles.filter(
            role__code__in={"platform_admin", "super_admin"}
        ).exists():
            return Response({"error": {"message": "Cannot impersonate platform admins"}}, status=403)

        refresh = RefreshToken.for_user(target)
        refresh["impersonator_id"] = str(request.user.id)
        refresh["impersonation"] = True
        access = refresh.access_token
        access["impersonator_id"] = str(request.user.id)
        access["impersonation"] = True

        svc.audit(
            actor=request.user,
            tenant=tenant,
            action="platform.impersonation.start",
            resource_type="user",
            resource_id=str(target.id),
            reason=reason,
            metadata={"target_email": target.email},
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(
            {
                "access": str(access),
                "refresh": str(refresh),
                "token_type": "Bearer",
                "expires_in": int(access["exp"] - timezone.now().timestamp()),
                "impersonator_id": str(request.user.id),
                "acting_as": UserProfileSerializer(target).data,
            }
        )


class PlatformImpersonationEndView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request) -> Response:
        impersonator_id = request.auth.get("impersonator_id") if request.auth else None
        if not impersonator_id:
            return Response({"error": {"message": "Not in an impersonation session"}}, status=400)
        admin = get_object_or_404(User.objects.all(), id=impersonator_id)
        refresh = RefreshToken.for_user(admin)
        access = refresh.access_token
        _svc().audit(
            actor=admin,
            action="platform.impersonation.end",
            resource_type="user",
            resource_id=str(request.user.id),
            reason="end_impersonation",
            metadata={"ended_for": request.user.email},
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(
            {
                "access": str(access),
                "refresh": str(refresh),
                "token_type": "Bearer",
                "expires_in": int(access["exp"] - timezone.now().timestamp()),
                "user": UserProfileSerializer(admin).data,
            }
        )


class PlatformTenantFlagsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        return success_response({"flags": _svc().list_flags(tenant=tenant)})

    @extend_schema(tags=["Platform Admin"])
    def patch(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        flags = request.data.get("flags") or {}
        rows = _svc().update_flags(
            tenant=tenant,
            flags=flags,
            actor=request.user,
            reason=request.data.get("reason", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response({"flags": rows})


class PlatformTenantPaymentsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        return success_response({"payments": _svc().list_payments(tenant=tenant)})


class PlatformPaymentRefundView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, tenant_id: str, payment_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        result = _svc().refund_payment(
            tenant=tenant,
            session_id=payment_id,
            actor=request.user,
            reason=request.data.get("reason", ""),
            amount_paise=request.data.get("amount_paise"),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(result)


class PlatformCreditsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        return success_response({"balance_paise": _svc().credit_balance(tenant=tenant)})

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        result = _svc().grant_credit(
            tenant=tenant,
            actor=request.user,
            amount_paise=int(request.data.get("amount_paise") or 0),
            reason=request.data.get("reason", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(result)


class PlatformCouponsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        rows = [
            {
                "id": str(c.id),
                "code": c.code,
                "percent_off": c.percent_off,
                "amount_off_paise": c.amount_off_paise,
                "is_active": c.is_active,
                "redemption_count": c.redemption_count,
            }
            for c in PlatformCoupon.objects.all()[:100]
        ]
        return success_response({"coupons": rows})

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request) -> Response:
        coupon = _svc().upsert_coupon(
            actor=request.user,
            code=request.data.get("code", ""),
            percent_off=request.data.get("percent_off"),
            amount_off_paise=request.data.get("amount_off_paise"),
            is_active=bool(request.data.get("is_active", True)),
            reason=request.data.get("reason", "coupon upsert"),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response({"id": str(coupon.id), "code": coupon.code}, status_code=201)


class PlatformAuditFeedView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        qs = PlatformAuditEvent.objects.select_related("actor", "tenant").all()
        tenant_id = request.query_params.get("tenant_id")
        action = request.query_params.get("action")
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        if action:
            qs = qs.filter(action__icontains=action)
        limit = min(int(request.query_params.get("limit") or 100), 500)
        rows = [
            {
                "id": str(e.id),
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "reason": e.reason,
                "actor_email": e.actor.email if e.actor else None,
                "tenant_id": str(e.tenant_id) if e.tenant_id else None,
                "tenant_name": e.tenant.display_name if e.tenant else None,
                "metadata": e.metadata,
                "created_at": e.created_at.isoformat(),
            }
            for e in qs[:limit]
        ]
        return success_response({"events": rows})


class PlatformTicketsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        tenant_id = request.query_params.get("tenant_id")
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id) if tenant_id else None
        tickets = _svc().list_tickets(tenant=tenant)
        return success_response(
            {
                "tickets": [
                    {
                        "id": str(t.id),
                        "subject": t.subject,
                        "status": t.status,
                        "tenant_id": str(t.tenant_id),
                        "requester_email": t.requester.email if t.requester else None,
                        "created_at": t.created_at.isoformat(),
                    }
                    for t in tickets
                ]
            }
        )

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=request.data.get("tenant_id"))
        ticket = _svc().create_ticket(
            tenant=tenant,
            actor=request.user,
            subject=request.data.get("subject", "Support"),
            body=request.data.get("body", ""),
        )
        return success_response({"id": str(ticket.id)}, status_code=201)


class SupportTicketsView(APIView):
    """Customer / business user support tickets."""

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Support"])
    def get(self, request: Request) -> Response:
        tickets = SupportTicket.objects.filter(requester=request.user).order_by("-created_at")[:50]
        return success_response(
            {
                "tickets": [
                    {
                        "id": str(t.id),
                        "subject": t.subject,
                        "status": t.status,
                        "created_at": t.created_at.isoformat(),
                    }
                    for t in tickets
                ]
            }
        )

    @extend_schema(tags=["Support"])
    def post(self, request: Request) -> Response:
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            tenant_id = request.data.get("tenant_id")
            tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id) if tenant_id else None
        if tenant is None:
            tenant = Tenant.objects.filter(owner=request.user).first()
        if tenant is None:
            return Response({"error": {"message": "tenant required"}}, status=400)
        ticket = _svc().create_ticket(
            tenant=tenant,
            actor=request.user,
            subject=request.data.get("subject", "Support"),
            body=request.data.get("body", ""),
        )
        return success_response({"id": str(ticket.id), "status": ticket.status}, status_code=201)


class PlatformTicketNoteView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, ticket_id: str) -> Response:
        ticket = get_object_or_404(SupportTicket.objects.all(), id=ticket_id)
        note = SupportTicketNote.objects.create(
            ticket=ticket,
            author=request.user,
            body=request.data.get("body", ""),
            is_internal=bool(request.data.get("is_internal", True)),
        )
        if request.data.get("status"):
            ticket.status = request.data["status"]
            ticket.save(update_fields=["status", "updated_at"])
        return success_response({"id": str(note.id)}, status_code=201)


class PlatformAnnouncementsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        rows = [
            {
                "id": str(a.id),
                "title": a.title,
                "message": a.message,
                "severity": a.severity,
                "is_active": a.is_active,
                "starts_at": a.starts_at.isoformat() if a.starts_at else None,
                "ends_at": a.ends_at.isoformat() if a.ends_at else None,
            }
            for a in PlatformAnnouncement.objects.all()[:100]
        ]
        return success_response({"announcements": rows})

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request) -> Response:
        ann = PlatformAnnouncement.objects.create(
            title=request.data.get("title", "")[:160],
            message=request.data.get("message", ""),
            severity=request.data.get("severity", "info"),
            is_active=bool(request.data.get("is_active", True)),
        )
        _svc().audit(
            actor=request.user,
            action="platform.announcement.create",
            resource_type="announcement",
            resource_id=str(ann.id),
            reason=request.data.get("reason", "create announcement"),
        )
        return success_response({"id": str(ann.id)}, status_code=201)


class PlatformAnnouncementPublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        rows = [
            {
                "id": str(a.id),
                "title": a.title,
                "message": a.message,
                "severity": a.severity,
            }
            for a in _svc().active_announcements()
        ]
        return success_response({"announcements": rows})


class PlatformHelpArticlesAdminView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        rows = [
            {
                "id": str(a.id),
                "slug": a.slug,
                "title": a.title,
                "category": a.category,
                "is_published": a.is_published,
            }
            for a in HelpArticle.objects.all()[:200]
        ]
        return success_response({"articles": rows})

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request) -> Response:
        title = request.data.get("title", "Untitled")
        slug = slugify(request.data.get("slug") or title)[:160]
        article, _ = HelpArticle.objects.update_or_create(
            slug=slug,
            defaults={
                "title": title,
                "category": request.data.get("category", ""),
                "body": request.data.get("body", ""),
                "is_published": bool(request.data.get("is_published", False)),
                "keywords": request.data.get("keywords", ""),
            },
        )
        return success_response({"id": str(article.id), "slug": article.slug}, status_code=201)


class PlatformHelpPublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(tags=["Help"])
    def get(self, request: Request) -> Response:
        slug = request.query_params.get("slug")
        if slug:
            article = get_object_or_404(HelpArticle.objects.filter(is_published=True), slug=slug)
            return success_response(
                {
                    "id": str(article.id),
                    "slug": article.slug,
                    "title": article.title,
                    "category": article.category,
                    "body": article.body,
                }
            )
        articles = _svc().published_help_articles(query=request.query_params.get("q", ""))
        return success_response(
            {
                "articles": [
                    {
                        "id": str(a.id),
                        "slug": a.slug,
                        "title": a.title,
                        "category": a.category,
                    }
                    for a in articles
                ]
            }
        )


class PlatformExportView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, export_type: str) -> HttpResponse:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        if export_type == "tenants":
            writer.writerow(["id", "slug", "display_name", "status", "created_at"])
            for t in Tenant.objects.all().order_by("display_name"):
                writer.writerow([t.id, t.slug, t.display_name, t.status, t.created_at.isoformat()])
        elif export_type == "audit":
            writer.writerow(["id", "action", "actor", "tenant", "reason", "created_at"])
            for e in PlatformAuditEvent.objects.select_related("actor", "tenant")[:1000]:
                writer.writerow(
                    [
                        e.id,
                        e.action,
                        e.actor.email if e.actor else "",
                        e.tenant.slug if e.tenant else "",
                        e.reason,
                        e.created_at.isoformat(),
                    ]
                )
        elif export_type == "payments":
            writer.writerow(["tenant", "order_id", "amount_paise", "status", "plan_code", "created_at"])
            for t in Tenant.objects.all()[:50]:
                for p in _svc().list_payments(tenant=t)[:50]:
                    writer.writerow(
                        [
                            t.slug,
                            p["order_id"],
                            p["amount_paise"],
                            p["status"],
                            p["plan_code"],
                            p["created_at"],
                        ]
                    )
        else:
            return Response({"error": {"message": "Unknown export"}}, status=400)
        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{export_type}.csv"'
        return response


class PlatformCreateTenantView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request) -> Response:
        reason = _svc().require_reason(request.data.get("reason", "create tenant"))
        owner_email = request.data.get("owner_email")
        owner = User.objects.filter(email__iexact=owner_email).first() if owner_email else request.user
        if owner is None:
            return Response({"error": {"message": "owner_email not found"}}, status=400)

        display_name = (request.data.get("display_name") or "New Tenant").strip()
        business_name = (request.data.get("business_name") or display_name).strip()
        base_slug = slugify(request.data.get("slug") or display_name)[:60] or f"tenant-{uuid4().hex[:8]}"
        slug = base_slug
        suffix = 1
        while Tenant.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{suffix}"[:80]
            suffix += 1

        tenant = TenantService().create_tenant(
            data={
                "slug": slug,
                "display_name": display_name,
                "legal_name": request.data.get("legal_name") or business_name,
                "timezone": request.data.get("timezone") or "Asia/Kolkata",
                "currency": request.data.get("currency") or "INR",
                "language": request.data.get("language") or "en",
                "owner": owner,
            },
            actor=request.user,
        )
        organization = TenantRepository().default_organization(tenant)
        selected_product = request.data.get("selected_product") or "appointie"
        business = BusinessService().create_business(
            tenant=tenant,
            organization=organization,
            actor=owner,
            data={
                "business_code": slug[:40],
                "business_name": business_name,
                "display_name": display_name,
                "business_type": "service-business",
                "selected_product": selected_product,
                "currency": tenant.currency,
                "timezone": tenant.timezone,
                "language": tenant.language,
            },
        )
        _svc().roles.assign_role(
            user=owner, role_code="business_owner", assigned_by=str(request.user.id)
        )
        _svc().audit(
            actor=request.user,
            tenant=tenant,
            action="platform.tenant.create",
            resource_type="tenant",
            resource_id=str(tenant.id),
            reason=reason,
            metadata={"business_id": str(business.id), "owner_email": owner.email},
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(
            {
                "tenant_id": str(tenant.id),
                "slug": tenant.slug,
                "business_id": str(business.id),
            },
            status_code=201,
        )


def _minimal_pdf(lines: list[str]) -> bytes:
    """Build a tiny single-page PDF without external deps."""
    content_lines = ["BT", "/F1 11 Tf", "50 780 Td"]
    for index, line in enumerate(lines):
        safe = re.sub(r"[\\()]", "", line)[:120]
        if index == 0:
            content_lines.append(f"({safe}) Tj")
        else:
            content_lines.append(f"0 -16 Td ({safe}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")
    objects = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n"
    )
    objects.append(
        f"4 0 obj<< /Length {len(stream)} >>stream\n".encode() + stream + b"\nendstream\nendobj\n"
    )
    objects.append(b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode())
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode())
    out.extend(
        f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    )
    return bytes(out)


class PlatformInvoicePdfView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, invoice_id: str) -> HttpResponse:
        invoice = get_object_or_404(
            PlatformLedgerInvoice.objects.select_related("tenant", "business"),
            id=invoice_id,
        )
        lines = [
            "IE Platform Invoice",
            f"Invoice: {invoice.invoice_number}",
            f"Tenant: {invoice.tenant.display_name if invoice.tenant else '-'}",
            f"Business: {invoice.business.display_name if invoice.business else '-'}",
            f"Amount: {invoice.amount_paise / 100:.2f} {invoice.currency}",
            f"Status: {invoice.status}",
            f"Refunded: {invoice.refunded_paise / 100:.2f}",
            f"Payment: {invoice.razorpay_payment_id or '-'}",
            f"Issued: {invoice.created_at.isoformat()}",
        ]
        pdf = _minimal_pdf(lines)
        if not invoice.pdf_path:
            invoice.pdf_path = f"invoices/{invoice.invoice_number}.pdf"
            invoice.save(update_fields=["pdf_path", "updated_at"])
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        return response


class PlatformTransferOwnershipView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        reason = _svc().require_reason(request.data.get("reason", ""))
        new_owner = get_object_or_404(User.objects.all(), id=request.data.get("user_id"))
        before = str(tenant.owner_id) if tenant.owner_id else None
        tenant.owner = new_owner
        tenant.save(update_fields=["owner", "updated_at"])
        _svc().roles.assign_role(user=new_owner, role_code="business_owner", assigned_by=str(request.user.id))
        _svc().audit(
            actor=request.user,
            tenant=tenant,
            action="platform.tenant.transfer_ownership",
            resource_type="tenant",
            resource_id=str(tenant.id),
            reason=reason,
            metadata={"before_owner": before, "after_owner": str(new_owner.id)},
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response({"tenant_id": str(tenant.id), "owner_id": str(new_owner.id)})


class PlatformPurgeTenantView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        reason = _svc().require_reason(request.data.get("reason", ""))
        confirm = (request.data.get("confirm_slug") or "").strip()
        if confirm != tenant.slug:
            return Response({"error": {"message": "confirm_slug must match tenant slug"}}, status=400)
        # Soft-archive then deactivate; hard cascade purge kept conservative
        tenant.status = TenantStatus.ARCHIVED
        tenant.is_active = False
        tenant.save(update_fields=["status", "is_active", "updated_at"])
        Business.objects.filter(tenant=tenant).update(is_active=False, status="inactive")
        _svc().audit(
            actor=request.user,
            tenant=tenant,
            action="platform.tenant.purge",
            resource_type="tenant",
            resource_id=str(tenant.id),
            reason=reason,
            metadata={"slug": tenant.slug},
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response({"tenant_id": str(tenant.id), "status": tenant.status, "purged": True})
