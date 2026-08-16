from __future__ import annotations

from typing import Any

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.authentication.models import User
from apps.platform_admin.models import (
    PlatformAccrualBenefitType,
    PlatformAccrualStatus,
    PlatformAffiliate,
    PlatformAffiliateCode,
    PlatformAffiliateStatus,
    PlatformAffiliateType,
    PlatformPayout,
    PlatformPayoutStatus,
    PlatformReferral,
    PlatformReferralAccrual,
    PlatformReferralStatus,
)
from apps.platform_admin.services import PlatformAdminService
from apps.tenancy.models import Tenant


class AffiliateService:
    def __init__(self, *, admin: PlatformAdminService | None = None) -> None:
        self.admin = admin or PlatformAdminService()

    def serialize_affiliate(self, row: PlatformAffiliate) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "affiliate_type": row.affiliate_type,
            "tenant_id": str(row.tenant_id) if row.tenant_id else None,
            "name": row.name,
            "email": row.email,
            "status": row.status,
            "payout_method": row.payout_method or "",
            "upi_vpa": row.upi_vpa or "",
            "bank_account_name": row.bank_account_name or "",
            "bank_account_number": row.bank_account_number or "",
            "bank_ifsc": row.bank_ifsc or "",
            "payout_notes": row.payout_notes or "",
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "codes": [
                {
                    "id": str(code.id),
                    "affiliate_id": str(code.affiliate_id),
                    "code": code.code,
                    "is_active": code.is_active,
                }
                for code in row.codes.all()
            ],
        }

    def serialize_code(self, row: PlatformAffiliateCode) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "affiliate_id": str(row.affiliate_id),
            "code": row.code,
            "is_active": row.is_active,
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    def serialize_referral(self, row: PlatformReferral) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "affiliate_id": str(row.affiliate_id),
            "referred_tenant_id": str(row.referred_tenant_id),
            "affiliate_code_id": str(row.affiliate_code_id) if row.affiliate_code_id else None,
            "starts_at": row.starts_at.isoformat() if row.starts_at else None,
            "months": row.months,
            "status": row.status,
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    def serialize_accrual(self, row: PlatformReferralAccrual) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "referral_id": str(row.referral_id),
            "period_yyyy_mm": row.period_yyyy_mm,
            "amount_paise": row.amount_paise,
            "benefit_type": row.benefit_type,
            "status": row.status,
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    def serialize_payout(self, row: PlatformPayout) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "affiliate_id": str(row.affiliate_id),
            "amount_paise": row.amount_paise,
            "status": row.status,
            "payment_ref": row.payment_ref,
            "notes": row.notes,
            "accrual_id": str(row.accrual_id) if row.accrual_id else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    @transaction.atomic
    def upsert_affiliate(
        self,
        *,
        actor: User,
        affiliate_id: str | None = None,
        affiliate_type: str = PlatformAffiliateType.PARTNER,
        tenant_id: str | None = None,
        name: str = "",
        email: str = "",
        status: str = PlatformAffiliateStatus.ACTIVE,
        payout_method: str = "",
        upi_vpa: str = "",
        bank_account_name: str = "",
        bank_account_number: str = "",
        bank_ifsc: str = "",
        payout_notes: str = "",
        metadata: dict | None = None,
        reason: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformAffiliate:
        reason = self.admin.require_reason(reason)
        name = (name or "").strip()
        email = (email or "").strip().lower()
        affiliate_type = str(affiliate_type or PlatformAffiliateType.PARTNER).strip().lower()
        if affiliate_type not in PlatformAffiliateType.values:
            raise ValidationError({"affiliate_type": "Must be tenant or partner."})
        tenant = None
        if tenant_id:
            tenant = get_object_or_404(Tenant.objects.select_related("owner").all(), id=tenant_id)
            if not email and tenant.owner_id and getattr(tenant.owner, "email", None):
                email = tenant.owner.email.strip().lower()
            if not name:
                name = tenant.display_name or tenant.name or ""
        elif affiliate_type == PlatformAffiliateType.TENANT:
            raise ValidationError({"tenant_id": "Tenant affiliates require tenant_id."})
        if not name:
            raise ValidationError({"name": "Name is required."})
        if not email:
            raise ValidationError({"email": "Email is required."})

        payout_method = str(payout_method or "").strip().lower()
        upi_vpa = str(upi_vpa or "").strip()
        bank_account_name = str(bank_account_name or "").strip()
        bank_account_number = str(bank_account_number or "").strip()
        bank_ifsc = str(bank_ifsc or "").strip().upper()
        payout_notes = str(payout_notes or "").strip()

        if affiliate_id:
            row = get_object_or_404(PlatformAffiliate, id=affiliate_id)
            row.affiliate_type = affiliate_type
            row.tenant = tenant
            row.name = name
            row.email = email
            row.status = status
            row.payout_method = payout_method
            row.upi_vpa = upi_vpa
            row.bank_account_name = bank_account_name
            row.bank_account_number = bank_account_number
            row.bank_ifsc = bank_ifsc
            row.payout_notes = payout_notes
            row.metadata = metadata or row.metadata or {}
            row.save()
            created = False
        else:
            row = PlatformAffiliate.objects.create(
                affiliate_type=affiliate_type,
                tenant=tenant,
                name=name,
                email=email,
                status=status,
                payout_method=payout_method,
                upi_vpa=upi_vpa,
                bank_account_name=bank_account_name,
                bank_account_number=bank_account_number,
                bank_ifsc=bank_ifsc,
                payout_notes=payout_notes,
                metadata=metadata or {},
            )
            created = True
        self.admin.audit(
            actor=actor,
            action="platform.affiliate.upsert",
            resource_type="platform_affiliate",
            resource_id=str(row.id),
            tenant=tenant,
            reason=reason,
            metadata={"created": created, "email": email, "payout_method": payout_method},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return row

    @transaction.atomic
    def upsert_code(
        self,
        *,
        actor: User,
        affiliate_id: str,
        code: str,
        is_active: bool = True,
        reason: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformAffiliateCode:
        reason = self.admin.require_reason(reason)
        affiliate = get_object_or_404(PlatformAffiliate, id=affiliate_id)
        normalized = slugify(code).upper().replace("-", "")
        if not normalized:
            raise ValidationError({"code": "Code is required."})
        row, created = PlatformAffiliateCode.objects.update_or_create(
            code=normalized,
            defaults={"affiliate": affiliate, "is_active": is_active},
        )
        self.admin.audit(
            actor=actor,
            action="platform.affiliate_code.upsert",
            resource_type="platform_affiliate_code",
            resource_id=str(row.id),
            tenant=affiliate.tenant,
            reason=reason,
            metadata={"created": created, "code": normalized},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return row

    @transaction.atomic
    def delete_affiliate(
        self,
        *,
        actor: User,
        affiliate_id: str,
        reason: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> None:
        reason = self.admin.require_reason(reason)
        row = get_object_or_404(PlatformAffiliate, id=affiliate_id)
        actor_id = getattr(actor, "id", None)
        for code in PlatformAffiliateCode.objects.filter(affiliate=row):
            code.is_active = False
            code.save(update_fields=["is_active", "updated_at"])
            code.soft_delete(deleted_by=actor_id)
        row.status = PlatformAffiliateStatus.INACTIVE
        row.save(update_fields=["status", "updated_at"])
        row.soft_delete(deleted_by=actor_id)
        self.admin.audit(
            actor=actor,
            action="platform.affiliate.delete",
            resource_type="platform_affiliate",
            resource_id=str(row.id),
            tenant=row.tenant,
            reason=reason,
            metadata={"email": row.email, "name": row.name},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    @transaction.atomic
    def delete_code(
        self,
        *,
        actor: User,
        code_id: str,
        reason: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> None:
        reason = self.admin.require_reason(reason)
        row = get_object_or_404(PlatformAffiliateCode, id=code_id)
        row.is_active = False
        row.save(update_fields=["is_active", "updated_at"])
        row.soft_delete(deleted_by=getattr(actor, "id", None))
        self.admin.audit(
            actor=actor,
            action="platform.affiliate_code.delete",
            resource_type="platform_affiliate_code",
            resource_id=str(row.id),
            tenant=row.affiliate.tenant,
            reason=reason,
            metadata={"code": row.code, "affiliate_id": str(row.affiliate_id)},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    @staticmethod
    def normalize_code(code: str) -> str:
        return slugify(str(code or "")).upper().replace("-", "")

    def require_active_code(self, code: str) -> PlatformAffiliateCode:
        normalized = self.normalize_code(code)
        if not normalized:
            raise ValidationError({"affiliate_code": "Affiliate code not found."})
        affiliate_code = (
            PlatformAffiliateCode.objects.select_related("affiliate")
            .filter(code=normalized, is_active=True)
            .first()
        )
        if affiliate_code is None or affiliate_code.affiliate.status != PlatformAffiliateStatus.ACTIVE:
            raise ValidationError({"affiliate_code": "Affiliate code not found."})
        return affiliate_code

    @transaction.atomic
    def attribute_signup(
        self,
        *,
        referred_tenant: Tenant,
        code: str,
        months: int = 12,
    ) -> PlatformReferral | None:
        normalized = self.normalize_code(code)
        if not normalized:
            return None
        affiliate_code = self.require_active_code(normalized)
        affiliate = affiliate_code.affiliate
        if PlatformReferral.objects.filter(referred_tenant=referred_tenant).exists():
            return None
        if affiliate.tenant_id and affiliate.tenant_id == referred_tenant.id:
            raise ValidationError({"affiliate_code": "Cannot refer your own workspace."})
        return PlatformReferral.objects.create(
            affiliate=affiliate,
            referred_tenant=referred_tenant,
            affiliate_code=affiliate_code,
            starts_at=timezone.now(),
            months=max(1, int(months or 12)),
            status=PlatformReferralStatus.ACTIVE,
            metadata={"code": normalized},
        )

    @transaction.atomic
    def accrue_monthly(
        self,
        *,
        referral: PlatformReferral,
        period_yyyy_mm: str,
        amount_paise: int,
        benefit_type: str = PlatformAccrualBenefitType.CREDIT,
        actor: User | None = None,
        reason: str = "monthly accrual",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformReferralAccrual:
        period = str(period_yyyy_mm or "").strip()
        if len(period) != 7 or period[4] != "-":
            raise ValidationError({"period_yyyy_mm": "Use YYYY-MM format."})
        amount = int(amount_paise or 0)
        if amount <= 0:
            raise ValidationError({"amount_paise": "Must be positive."})
        benefit = str(benefit_type or PlatformAccrualBenefitType.CREDIT).strip().lower()
        if benefit not in PlatformAccrualBenefitType.values:
            raise ValidationError({"benefit_type": "Must be credit or payout."})
        if referral.status != PlatformReferralStatus.ACTIVE:
            raise ValidationError({"referral": "Referral is not active."})
        accrual, created = PlatformReferralAccrual.objects.get_or_create(
            referral=referral,
            period_yyyy_mm=period,
            defaults={
                "amount_paise": amount,
                "benefit_type": benefit,
                "status": PlatformAccrualStatus.PENDING,
            },
        )
        if not created:
            if accrual.status != PlatformAccrualStatus.PENDING:
                raise ValidationError({"period_yyyy_mm": "Accrual already processed for this period."})
            accrual.amount_paise = amount
            accrual.benefit_type = benefit
            accrual.save(update_fields=["amount_paise", "benefit_type", "updated_at"])
        if actor is not None:
            self.admin.audit(
                actor=actor,
                action="platform.affiliate.accrual",
                resource_type="platform_referral_accrual",
                resource_id=str(accrual.id),
                tenant=referral.referred_tenant,
                reason=self.admin.require_reason(reason),
                metadata={
                    "period_yyyy_mm": period,
                    "amount_paise": amount,
                    "benefit_type": benefit,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
        return accrual

    @transaction.atomic
    def approve_accrual_as_credit(
        self,
        *,
        accrual: PlatformReferralAccrual,
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformReferralAccrual:
        reason = self.admin.require_reason(reason)
        locked = PlatformReferralAccrual.objects.select_for_update().select_related(
            "referral__affiliate", "referral__referred_tenant"
        ).get(id=accrual.id)
        if locked.status not in {PlatformAccrualStatus.PENDING, PlatformAccrualStatus.APPROVED}:
            raise ValidationError({"status": "Accrual cannot be credited in its current state."})
        affiliate = locked.referral.affiliate
        if not affiliate.tenant_id:
            raise ValidationError(
                {"affiliate": "Credit approval requires a tenant-linked affiliate."}
            )
        self.admin.grant_credit(
            tenant=affiliate.tenant,
            actor=actor,
            amount_paise=int(locked.amount_paise),
            reason=f"Affiliate accrual {locked.period_yyyy_mm}: {reason}",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        locked.status = PlatformAccrualStatus.CREDITED
        locked.benefit_type = PlatformAccrualBenefitType.CREDIT
        locked.save(update_fields=["status", "benefit_type", "updated_at"])
        self.admin.audit(
            actor=actor,
            action="platform.affiliate.accrual.credit",
            resource_type="platform_referral_accrual",
            resource_id=str(locked.id),
            tenant=affiliate.tenant,
            reason=reason,
            metadata={"amount_paise": locked.amount_paise},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return locked

    @transaction.atomic
    def approve_accrual_as_payout(
        self,
        *,
        accrual: PlatformReferralAccrual,
        actor: User,
        reason: str,
        payment_ref: str = "",
        notes: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformPayout:
        reason = self.admin.require_reason(reason)
        locked = PlatformReferralAccrual.objects.select_for_update().select_related(
            "referral__affiliate"
        ).get(id=accrual.id)
        if locked.status not in {PlatformAccrualStatus.PENDING, PlatformAccrualStatus.APPROVED}:
            raise ValidationError({"status": "Accrual cannot be paid out in its current state."})
        payout = PlatformPayout.objects.create(
            affiliate=locked.referral.affiliate,
            amount_paise=int(locked.amount_paise),
            status=PlatformPayoutStatus.PENDING,
            payment_ref=str(payment_ref or "").strip(),
            notes=str(notes or reason).strip(),
            accrual=locked,
        )
        locked.status = PlatformAccrualStatus.APPROVED
        locked.benefit_type = PlatformAccrualBenefitType.PAYOUT
        locked.save(update_fields=["status", "benefit_type", "updated_at"])
        self.admin.audit(
            actor=actor,
            action="platform.affiliate.accrual.payout",
            resource_type="platform_payout",
            resource_id=str(payout.id),
            tenant=locked.referral.affiliate.tenant,
            reason=reason,
            metadata={"amount_paise": payout.amount_paise, "accrual_id": str(locked.id)},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return payout

    @transaction.atomic
    def mark_payout_paid(
        self,
        *,
        payout: PlatformPayout,
        actor: User,
        reason: str,
        payment_ref: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformPayout:
        reason = self.admin.require_reason(reason)
        locked = PlatformPayout.objects.select_for_update().select_related("accrual").get(id=payout.id)
        if locked.status != PlatformPayoutStatus.PENDING:
            raise ValidationError({"status": "Only pending payouts can be marked paid."})
        if payment_ref:
            locked.payment_ref = str(payment_ref).strip()
        locked.status = PlatformPayoutStatus.PAID
        locked.save(update_fields=["status", "payment_ref", "updated_at"])
        if locked.accrual_id:
            PlatformReferralAccrual.objects.filter(id=locked.accrual_id).update(
                status=PlatformAccrualStatus.PAID
            )
        self.admin.audit(
            actor=actor,
            action="platform.affiliate.payout.paid",
            resource_type="platform_payout",
            resource_id=str(locked.id),
            tenant=locked.affiliate.tenant,
            reason=reason,
            metadata={"payment_ref": locked.payment_ref},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return locked
