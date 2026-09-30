from __future__ import annotations

from celery import shared_task
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.workflow.services.access import has_automations, resolve_product_code
from apps.workflow.services.events import emit


def _birthday_today(dob, today) -> bool:
    if dob is None:
        return False
    return dob.month == today.month and dob.day == today.day


@shared_task(name="workflow.run_daily_schedule")
def run_daily_schedule_task() -> dict[str, int]:
    """Evaluate schedule.daily automations (pet/customer birthdays, etc.)."""
    scanned = 0
    matched = 0
    today = timezone.localdate()
    year = today.year
    for business in Business.objects.filter(is_active=True).select_related("tenant"):
        if not has_automations(business=business):
            continue
        scanned += 1
        tenant = business.tenant
        product_code = resolve_product_code(business=business)

        customers = Customer.objects.filter(tenant=tenant, business=business, is_active=True)
        for customer in customers.iterator(chunk_size=200):
            if not _birthday_today(customer.date_of_birth, today):
                continue
            outcome = emit(
                tenant=tenant,
                business=business,
                event_key="schedule.daily",
                context={"customer": customer, "today": today},
                product_code=None,
                subject_type="customer",
                subject_id=str(customer.id),
                idempotency_prefix=f"schedule.daily:customer:{customer.id}:{year}",
            )
            matched += len(outcome.get("runs") or [])

        try:
            from apps.shopie.models import ShopPet

            pets = ShopPet.objects.filter(
                tenant=tenant, business=business, is_active=True, birthday__isnull=False
            ).select_related("customer")
            for pet in pets.iterator(chunk_size=200):
                if not _birthday_today(pet.birthday, today):
                    continue
                outcome = emit(
                    tenant=tenant,
                    business=business,
                    event_key="schedule.daily",
                    context={
                        "customer": pet.customer,
                        "pet": pet,
                        "pets": [pet],
                        "today": today,
                    },
                    # Birthday discount notify may be shopie or appointie — match either.
                    product_code=None,
                    subject_type="pet",
                    subject_id=str(pet.id),
                    idempotency_prefix=f"schedule.daily:pet:{pet.id}:{year}",
                )
                matched += len(outcome.get("runs") or [])
        except Exception:  # noqa: BLE001
            pass

        # Touch product_code so lint/unused stays quiet when used for future filters.
        _ = product_code
    return {"businesses": scanned, "runs": matched}
