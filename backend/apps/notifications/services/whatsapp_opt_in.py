from __future__ import annotations

from django.utils import timezone

from apps.authentication.models import User
from apps.customers.models import Customer, CustomerPreferences
from apps.notifications.services.preferences import merge_notification_preferences


def set_whatsapp_opt_in(
    *,
    enabled: bool,
    user: User | None = None,
    customer: Customer | None = None,
) -> None:
    opted_in = bool(enabled)
    if user is not None:
        user.notification_preferences = merge_notification_preferences(
            getattr(user, "notification_preferences", None),
            {"whatsapp": opted_in},
        )
        user.save(update_fields=["notification_preferences", "updated_at"])
    if customer is None:
        return
    prefs, _ = CustomerPreferences.objects.get_or_create(
        tenant=customer.tenant,
        customer=customer,
        defaults={"communication_preferences": {"whatsapp": opted_in}},
    )
    communication = dict(prefs.communication_preferences or {})
    communication["whatsapp"] = opted_in
    prefs.communication_preferences = communication
    prefs.save(update_fields=["communication_preferences", "updated_at"])
    from apps.customers.models import CommunicationChannel, CustomerCommunicationPreference

    if opted_in:
        record, created = CustomerCommunicationPreference.objects.get_or_create(
            tenant=customer.tenant,
            customer=customer,
            channel=CommunicationChannel.WHATSAPP,
            defaults={"is_enabled": True, "opt_in_at": timezone.now()},
        )
        if not created:
            record.is_enabled = True
            record.opt_in_at = record.opt_in_at or timezone.now()
            record.opt_out_at = None
            record.save(update_fields=["is_enabled", "opt_in_at", "opt_out_at", "updated_at"])
        return
    CustomerCommunicationPreference.objects.filter(
        tenant=customer.tenant,
        customer=customer,
        channel=CommunicationChannel.WHATSAPP,
    ).update(is_enabled=False, opt_out_at=timezone.now())


def customer_whatsapp_opted_in(customer: Customer | None) -> bool:
    if customer is None:
        return False
    prefs = None
    try:
        prefs = customer.preferences
    except CustomerPreferences.DoesNotExist:
        prefs = None
    except Exception:
        prefs = None
    communication = getattr(prefs, "communication_preferences", None) if prefs is not None else None
    if isinstance(communication, dict) and communication.get("whatsapp") is True:
        return True
    from apps.customers.models import CommunicationChannel, CustomerCommunicationPreference

    return CustomerCommunicationPreference.objects.filter(
        tenant=customer.tenant,
        customer=customer,
        channel=CommunicationChannel.WHATSAPP,
        is_enabled=True,
    ).exists()
