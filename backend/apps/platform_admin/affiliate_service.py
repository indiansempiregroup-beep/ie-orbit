from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable

from django.db import transaction
from django.db.models import Case, IntegerField, Sum, When
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
    PlatformAffiliateCommissionTrigger,
    PlatformAffiliateCommissionType,
    PlatformAffiliateLedgerEntry,
    PlatformAffiliateLedgerKind,
    PlatformAffiliateLedgerStatus,
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

EMPTY_MONEY = {
    "earned_paise": 0,
    "paid_paise": 0,
    "credited_paise": 0,
    "settled_paise": 0,
    "outstanding_paise": 0,
}


class AffiliateService:
    def __init__(self, *, admin: PlatformAdminService | None = None) -> None:
        self.admin = admin or PlatformAdminService()

    @staticmethod
    def money_from_row(row: dict[str, Any] | None) -> dict[str, int]:
        earned = int((row or {}).get("earned_paise") or 0)
        paid = int((row or {}).get("paid_paise") or 0)
        credited = int((row or {}).get("credited_paise") or 0)
        return {
            "earned_paise": earned,
            "paid_paise": paid,
            "credited_paise": credited,
            "settled_paise": paid + credited,
            "outstanding_paise": earned - paid - credited,
        }

    def ledger_totals_by(
        self,
        *,
        group_field: str,
        ids: Iterable[str] | None = None,
    ) -> dict[str, dict[str, int]]:
        qs = PlatformAffiliateLedgerEntry.objects.filter(status=PlatformAffiliateLedgerStatus.RECORDED)
        if ids is not None:
            qs = qs.filter(**{f"{group_field}__in": list(ids)})
        rows = qs.values(group_field).annotate(
            earned_paise=Sum(
                Case(
                    When(kind=PlatformAffiliateLedgerKind.EARNING, then="amount_paise"),
                    default=0,
                    output_field=IntegerField(),
                )
            ),
            paid_paise=Sum(
                Case(
                    When(kind=PlatformAffiliateLedgerKind.PAYMENT, then="amount_paise"),
                    default=0,
                    output_field=IntegerField(),
                )
            ),
            credited_paise=Sum(
                Case(
                    When(kind=PlatformAffiliateLedgerKind.CREDIT, then="amount_paise"),
                    default=0,
                    output_field=IntegerField(),
                )
            ),
        )
        out: dict[str, dict[str, int]] = defaultdict(lambda: dict(EMPTY_MONEY))
        for row in rows:
            key = str(row.get(group_field) or "")
            if not key:
                continue
            out[key] = self.money_from_row(row)
        return out

    def insights(self) -> dict[str, Any]:
        money = self.money_from_row(
            PlatformAffiliateLedgerEntry.objects.filter(
                status=PlatformAffiliateLedgerStatus.RECORDED
            ).aggregate(
                earned_paise=Sum(
                    Case(
                        When(kind=PlatformAffiliateLedgerKind.EARNING, then="amount_paise"),
                        default=0,
                        output_field=IntegerField(),
                    )
                ),
                paid_paise=Sum(
                    Case(
                        When(kind=PlatformAffiliateLedgerKind.PAYMENT, then="amount_paise"),
                        default=0,
                        output_field=IntegerField(),
                    )
                ),
                credited_paise=Sum(
                    Case(
                        When(kind=PlatformAffiliateLedgerKind.CREDIT, then="amount_paise"),
                        default=0,
                        output_field=IntegerField(),
                    )
                ),
            )
        )
        return {
            **money,
            "affiliate_count": PlatformAffiliate.objects.count(),
            "referral_count": PlatformReferral.objects.count(),
        }

    def serialize_affiliate(
        self,
        row: PlatformAffiliate,
        *,
        money: dict[str, int] | None = None,
        referral_count: int | None = None,
    ) -> dict[str, Any]:
        totals = money or EMPTY_MONEY
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
            "default_commission_paise": int(row.default_commission_paise or 0),
            "commission_trigger": row.commission_trigger or PlatformAffiliateCommissionTrigger.FIRST_PAYMENT,
            "commission_type": row.commission_type or PlatformAffiliateCommissionType.FLAT,
            "commission_percent": float(row.commission_percent or 0),
            "commission_summary": self.commission_summary(row),
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "referral_count": int(referral_count or 0),
            **totals,
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

    @staticmethod
    def commission_summary(row: PlatformAffiliate) -> str:
        trigger = str(row.commission_trigger or PlatformAffiliateCommissionTrigger.FIRST_PAYMENT)
        if trigger == PlatformAffiliateCommissionTrigger.NONE:
            return "Manual only — add earnings yourself."
        when = (
            "First installment"
            if trigger == PlatformAffiliateCommissionTrigger.FIRST_PAYMENT
            else "Every installment"
        )
        if str(row.commission_type or "") == PlatformAffiliateCommissionType.PERCENT:
            percent = Decimal(str(row.commission_percent or 0))
            if percent <= 0:
                return f"{when}: percentage not set yet."
            quantized = percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            return f"{when}: {quantized}% of the amount paid."
        amount = int(row.default_commission_paise or 0)
        if amount <= 0:
            return f"{when}: amount not set yet."
        rupees = amount / 100
        return f"{when}: ₹{rupees:,.0f}."

    def serialize_code(self, row: PlatformAffiliateCode) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "affiliate_id": str(row.affiliate_id),
            "code": row.code,
            "is_active": row.is_active,
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    def serialize_referral(
        self,
        row: PlatformReferral,
        *,
        money: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        referred = getattr(row, "referred_tenant", None)
        affiliate = getattr(row, "affiliate", None)
        code = getattr(row, "affiliate_code", None)
        totals = money or EMPTY_MONEY
        return {
            "id": str(row.id),
            "affiliate_id": str(row.affiliate_id),
            "affiliate_name": affiliate.name if affiliate else "",
            "referred_tenant_id": str(row.referred_tenant_id),
            "referred_tenant_name": referred.display_name if referred else "",
            "referred_tenant_slug": referred.slug if referred else "",
            "affiliate_code_id": str(row.affiliate_code_id) if row.affiliate_code_id else None,
            "affiliate_code": code.code if code else str((row.metadata or {}).get("code") or ""),
            "starts_at": row.starts_at.isoformat() if row.starts_at else None,
            "months": row.months,
            "status": row.status,
            "payment_account_open": bool((row.metadata or {}).get("payment_account_opened")),
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
            **totals,
        }

    def serialize_ledger(self, row: PlatformAffiliateLedgerEntry) -> dict[str, Any]:
        referral = getattr(row, "referral", None)
        referred = getattr(referral, "referred_tenant", None) if referral else None
        affiliate = getattr(row, "affiliate", None)
        return {
            "id": str(row.id),
            "affiliate_id": str(row.affiliate_id),
            "affiliate_name": affiliate.name if affiliate else "",
            "referral_id": str(row.referral_id) if row.referral_id else None,
            "referred_tenant_name": referred.display_name if referred else "",
            "referred_tenant_slug": referred.slug if referred else "",
            "kind": row.kind,
            "amount_paise": int(row.amount_paise),
            "period_yyyy_mm": row.period_yyyy_mm or "",
            "payment_ref": row.payment_ref or "",
            "notes": row.notes or "",
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
        default_commission_paise: int = 0,
        commission_trigger: str = PlatformAffiliateCommissionTrigger.FIRST_PAYMENT,
        commission_type: str = PlatformAffiliateCommissionType.FLAT,
        commission_percent: Decimal | float | str | int = 0,
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
        try:
            default_commission_paise = max(0, int(default_commission_paise or 0))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"default_commission_paise": "Must be a whole number in paise."}) from exc
        trigger = str(commission_trigger or PlatformAffiliateCommissionTrigger.FIRST_PAYMENT).strip().lower()
        if trigger not in PlatformAffiliateCommissionTrigger.values:
            raise ValidationError({"commission_trigger": "Must be first_payment, every_payment, or none."})
        kind = str(commission_type or PlatformAffiliateCommissionType.FLAT).strip().lower()
        if kind not in PlatformAffiliateCommissionType.values:
            raise ValidationError({"commission_type": "Must be flat or percent."})
        try:
            percent = Decimal(str(commission_percent if commission_percent is not None else 0))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError({"commission_percent": "Must be a number."}) from exc
        if percent < 0 or percent > 100:
            raise ValidationError({"commission_percent": "Must be between 0 and 100."})
        percent = percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

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
            row.default_commission_paise = default_commission_paise
            row.commission_trigger = trigger
            row.commission_type = kind
            row.commission_percent = percent
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
                default_commission_paise=default_commission_paise,
                commission_trigger=trigger,
                commission_type=kind,
                commission_percent=percent,
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
        referral = PlatformReferral.objects.create(
            affiliate=affiliate,
            referred_tenant=referred_tenant,
            affiliate_code=affiliate_code,
            starts_at=timezone.now(),
            months=max(1, int(months or 12)),
            status=PlatformReferralStatus.ACTIVE,
            metadata={"code": normalized},
        )
        self.open_referral_payment_account(referral=referral)
        return referral

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
        self._sync_ledger_from_accrual(accrual=accrual, actor=actor)
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
        self._sync_ledger_from_accrual(accrual=locked, actor=actor)
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
        self._sync_ledger_from_payout(payout=locked, actor=actor)
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

    def serialize_affiliates(self, rows: list[PlatformAffiliate]) -> list[dict[str, Any]]:
        ids = [str(row.id) for row in rows]
        money_by = self.ledger_totals_by(group_field="affiliate_id", ids=ids)
        counts: dict[str, int] = defaultdict(int)
        for item in PlatformReferral.objects.filter(affiliate_id__in=ids).values("affiliate_id"):
            counts[str(item["affiliate_id"])] += 1
        return [
            self.serialize_affiliate(
                row,
                money=money_by.get(str(row.id), dict(EMPTY_MONEY)),
                referral_count=counts.get(str(row.id), 0),
            )
            for row in rows
        ]

    def serialize_referrals(self, rows: list[PlatformReferral]) -> list[dict[str, Any]]:
        ids = [str(row.id) for row in rows]
        money_by = self.ledger_totals_by(group_field="referral_id", ids=ids)
        return [
            self.serialize_referral(row, money=money_by.get(str(row.id), dict(EMPTY_MONEY)))
            for row in rows
        ]

    def list_ledger(
        self,
        *,
        affiliate_id: str | None = None,
        referral_id: str | None = None,
        kind: str | None = None,
        limit: int = 500,
    ) -> list[PlatformAffiliateLedgerEntry]:
        qs = PlatformAffiliateLedgerEntry.objects.select_related(
            "affiliate", "referral__referred_tenant"
        ).all()
        if affiliate_id:
            qs = qs.filter(affiliate_id=affiliate_id)
        if referral_id:
            qs = qs.filter(referral_id=referral_id)
        if kind:
            qs = qs.filter(kind=str(kind).strip().lower())
        return list(qs.order_by("-created_at")[: max(1, min(int(limit or 500), 1000))])

    def affiliate_detail(self, affiliate: PlatformAffiliate) -> dict[str, Any]:
        referrals = list(
            PlatformReferral.objects.select_related("affiliate", "referred_tenant", "affiliate_code")
            .filter(affiliate=affiliate)
            .order_by("-starts_at")
        )
        ledger = self.list_ledger(affiliate_id=str(affiliate.id), limit=500)
        money = self.ledger_totals_by(group_field="affiliate_id", ids=[str(affiliate.id)]).get(
            str(affiliate.id), dict(EMPTY_MONEY)
        )
        return {
            **self.serialize_affiliate(
                affiliate,
                money=money,
                referral_count=len(referrals),
            ),
            "insights": money,
            "referrals": self.serialize_referrals(referrals),
            "ledger": [self.serialize_ledger(row) for row in ledger],
            "history": [self.serialize_ledger(row) for row in ledger],
        }

    def open_referral_payment_account(
        self,
        *,
        referral: PlatformReferral,
        actor: User | None = None,
    ) -> PlatformReferral:
        meta = dict(referral.metadata or {})
        if not meta.get("payment_account_opened"):
            meta["payment_account_opened"] = True
            meta["payment_account_opened_at"] = timezone.now().isoformat()
            referral.metadata = meta
            referral.save(update_fields=["metadata", "updated_at"])
        return referral

    def record_checkout_commission(self, *, session: Any) -> PlatformAffiliateLedgerEntry | None:
        tenant_id = getattr(session, "tenant_id", None)
        if not tenant_id:
            return None
        referral = (
            PlatformReferral.objects.select_related("affiliate", "referred_tenant")
            .filter(
                referred_tenant_id=tenant_id,
                status=PlatformReferralStatus.ACTIVE,
            )
            .first()
        )
        if referral is None:
            return None
        affiliate = referral.affiliate
        if affiliate.status != PlatformAffiliateStatus.ACTIVE:
            return None
        trigger = str(affiliate.commission_trigger or PlatformAffiliateCommissionTrigger.FIRST_PAYMENT)
        if trigger == PlatformAffiliateCommissionTrigger.NONE:
            return None

        session_id = str(session.id)
        already = PlatformAffiliateLedgerEntry.objects.filter(
            referral=referral,
            kind=PlatformAffiliateLedgerKind.EARNING,
            metadata__checkout_session_id=session_id,
        ).exists()
        if already:
            return None

        if trigger == PlatformAffiliateCommissionTrigger.FIRST_PAYMENT:
            from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus

            prior_paid = (
                BillingCheckoutSession.objects.filter(
                    tenant_id=tenant_id,
                    status=CheckoutSessionStatus.PAID,
                )
                .exclude(id=session.id)
                .exists()
            )
            if prior_paid:
                return None
            first_already = PlatformAffiliateLedgerEntry.objects.filter(
                referral=referral,
                kind=PlatformAffiliateLedgerKind.EARNING,
                metadata__source="first_payment",
            ).exists()
            if first_already:
                return None
        elif trigger == PlatformAffiliateCommissionTrigger.EVERY_PAYMENT:
            months = max(1, int(referral.months or 12))
            window_end = referral.starts_at + timedelta(days=months * 30)
            if timezone.now() > window_end:
                return None
        else:
            return None

        amount = self._commission_amount_paise(affiliate=affiliate, paid_paise=int(session.amount_paise or 0))
        if amount <= 0:
            return None

        paid_at = getattr(session, "paid_at", None) or timezone.now()
        period = paid_at.strftime("%Y-%m")
        source = "first_payment" if trigger == PlatformAffiliateCommissionTrigger.FIRST_PAYMENT else "installment"
        referred_name = ""
        if getattr(referral, "referred_tenant", None):
            referred_name = referral.referred_tenant.display_name or referral.referred_tenant.slug
        notes = (
            f"Commission for {referred_name or 'referred business'} "
            f"({session.product_code} / {session.plan_code})"
        )
        return self.add_ledger_entry(
            actor=None,
            affiliate=affiliate,
            referral=referral,
            kind=PlatformAffiliateLedgerKind.EARNING,
            amount_paise=amount,
            period_yyyy_mm=period,
            notes=notes.strip(),
            reason="Auto commission on referred installment",
            metadata={
                "source": source,
                "checkout_session_id": session_id,
                "product_code": session.product_code,
                "plan_code": session.plan_code,
                "paid_amount_paise": int(session.amount_paise or 0),
                "commission_trigger": trigger,
                "commission_type": affiliate.commission_type,
            },
            require_reason=False,
        )

    def _commission_amount_paise(self, *, affiliate: PlatformAffiliate, paid_paise: int) -> int:
        kind = str(affiliate.commission_type or PlatformAffiliateCommissionType.FLAT)
        if kind == PlatformAffiliateCommissionType.PERCENT:
            percent = Decimal(str(affiliate.commission_percent or 0))
            if percent <= 0 or paid_paise <= 0:
                return 0
            return int((Decimal(paid_paise) * percent / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        return int(affiliate.default_commission_paise or 0)

    def _payout_snapshot(self, affiliate: PlatformAffiliate) -> dict[str, str]:
        return {
            "payout_method": affiliate.payout_method or "",
            "upi_vpa": affiliate.upi_vpa or "",
            "bank_account_name": affiliate.bank_account_name or "",
            "bank_account_number": affiliate.bank_account_number or "",
            "bank_ifsc": affiliate.bank_ifsc or "",
        }

    @transaction.atomic
    def add_ledger_entry(
        self,
        *,
        actor: User | None,
        affiliate: PlatformAffiliate,
        kind: str,
        amount_paise: int,
        referral: PlatformReferral | None = None,
        period_yyyy_mm: str = "",
        payment_ref: str = "",
        notes: str = "",
        reason: str = "",
        metadata: dict | None = None,
        ip_address: str | None = None,
        user_agent: str = "",
        require_reason: bool = True,
        grant_credit: bool = True,
    ) -> PlatformAffiliateLedgerEntry:
        kind_norm = str(kind or "").strip().lower()
        if kind_norm not in PlatformAffiliateLedgerKind.values:
            raise ValidationError({"kind": "Must be earning, payment, or credit."})
        try:
            amount = int(amount_paise or 0)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"amount_paise": "Must be a positive amount."}) from exc
        if amount <= 0:
            raise ValidationError({"amount_paise": "Must be a positive amount."})
        period = str(period_yyyy_mm or "").strip()
        if period and (len(period) != 7 or period[4] != "-"):
            raise ValidationError({"period_yyyy_mm": "Use YYYY-MM format."})
        if referral is not None and str(referral.affiliate_id) != str(affiliate.id):
            raise ValidationError({"referral_id": "Referral does not belong to this affiliate."})
        if require_reason:
            reason = self.admin.require_reason(reason)
        else:
            reason = str(reason or "affiliate ledger").strip() or "affiliate ledger"

        extra = dict(metadata or {})
        if kind_norm in {PlatformAffiliateLedgerKind.PAYMENT, PlatformAffiliateLedgerKind.CREDIT}:
            extra.update(self._payout_snapshot(affiliate))

        if kind_norm == PlatformAffiliateLedgerKind.CREDIT and grant_credit:
            if not affiliate.tenant_id:
                raise ValidationError(
                    {"affiliate": "Subscription credit requires a tenant-linked affiliate."}
                )
            if actor is None:
                raise ValidationError({"actor": "An admin is required to grant subscription credit."})
            self.admin.grant_credit(
                tenant=affiliate.tenant,
                actor=actor,
                amount_paise=amount,
                reason=reason or "Affiliate subscription credit",
                ip_address=ip_address,
                user_agent=user_agent,
            )

        entry = PlatformAffiliateLedgerEntry.objects.create(
            affiliate=affiliate,
            referral=referral,
            kind=kind_norm,
            amount_paise=amount,
            period_yyyy_mm=period,
            payment_ref=str(payment_ref or "").strip(),
            notes=str(notes or reason).strip(),
            status=PlatformAffiliateLedgerStatus.RECORDED,
            recorded_by=actor,
            metadata=extra,
        )
        if actor is not None:
            self.admin.audit(
                actor=actor,
                action=f"platform.affiliate.ledger.{kind_norm}",
                resource_type="platform_affiliate_ledger",
                resource_id=str(entry.id),
                tenant=affiliate.tenant,
                reason=reason,
                metadata={
                    "kind": kind_norm,
                    "amount_paise": amount,
                    "referral_id": str(referral.id) if referral else None,
                    "period_yyyy_mm": period,
                    "payment_ref": entry.payment_ref,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
        return entry

    def void_ledger_entry(
        self,
        *,
        actor: User,
        entry: PlatformAffiliateLedgerEntry,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformAffiliateLedgerEntry:
        reason = self.admin.require_reason(reason)
        locked = PlatformAffiliateLedgerEntry.objects.select_for_update().select_related(
            "affiliate"
        ).get(id=entry.id)
        if locked.status == PlatformAffiliateLedgerStatus.VOID:
            return locked
        locked.status = PlatformAffiliateLedgerStatus.VOID
        locked.save(update_fields=["status", "updated_at"])
        self.admin.audit(
            actor=actor,
            action="platform.affiliate.ledger.void",
            resource_type="platform_affiliate_ledger",
            resource_id=str(locked.id),
            tenant=locked.affiliate.tenant,
            reason=reason,
            metadata={"kind": locked.kind, "amount_paise": locked.amount_paise},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return locked

    def _sync_ledger_from_accrual(
        self,
        *,
        accrual: PlatformReferralAccrual,
        actor: User | None,
    ) -> None:
        if accrual.status == PlatformAccrualStatus.VOID:
            return
        referral = accrual.referral
        exists = PlatformAffiliateLedgerEntry.objects.filter(
            metadata__accrual_id=str(accrual.id),
            kind=PlatformAffiliateLedgerKind.EARNING,
        ).exists()
        if not exists:
            self.add_ledger_entry(
                actor=actor,
                affiliate=referral.affiliate,
                referral=referral,
                kind=PlatformAffiliateLedgerKind.EARNING,
                amount_paise=int(accrual.amount_paise),
                period_yyyy_mm=accrual.period_yyyy_mm,
                notes=f"Earning for {accrual.period_yyyy_mm}",
                reason="Legacy accrual mirrored to ledger",
                metadata={"accrual_id": str(accrual.id), "source": "accrual"},
                require_reason=False,
            )
        if accrual.status == PlatformAccrualStatus.CREDITED:
            credited = PlatformAffiliateLedgerEntry.objects.filter(
                metadata__accrual_id=str(accrual.id),
                kind=PlatformAffiliateLedgerKind.CREDIT,
            ).exists()
            if not credited:
                self.add_ledger_entry(
                    actor=actor,
                    affiliate=referral.affiliate,
                    referral=referral,
                    kind=PlatformAffiliateLedgerKind.CREDIT,
                    amount_paise=int(accrual.amount_paise),
                    period_yyyy_mm=accrual.period_yyyy_mm,
                    notes=f"Subscription credit for {accrual.period_yyyy_mm}",
                    reason="Legacy accrual credit mirrored to ledger",
                    metadata={"accrual_id": str(accrual.id), "source": "accrual"},
                    require_reason=False,
                    grant_credit=False,
                )

    def _sync_ledger_from_payout(
        self,
        *,
        payout: PlatformPayout,
        actor: User | None,
    ) -> None:
        if payout.status != PlatformPayoutStatus.PAID:
            return
        exists = PlatformAffiliateLedgerEntry.objects.filter(
            metadata__payout_id=str(payout.id),
            kind=PlatformAffiliateLedgerKind.PAYMENT,
        ).exists()
        if exists:
            return
        referral = payout.accrual.referral if payout.accrual_id else None
        self.add_ledger_entry(
            actor=actor,
            affiliate=payout.affiliate,
            referral=referral,
            kind=PlatformAffiliateLedgerKind.PAYMENT,
            amount_paise=int(payout.amount_paise),
            payment_ref=payout.payment_ref,
            notes=payout.notes or "Recorded payout",
            reason="Legacy payout mirrored to ledger",
            metadata={"payout_id": str(payout.id), "source": "payout"},
            require_reason=False,
        )
