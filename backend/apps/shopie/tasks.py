from __future__ import annotations

from celery import shared_task


@shared_task(name="shopie.analyze_packaging_images")
def analyze_packaging_images_task(
    job_id: str,
    front_image_url: str = "",
    back_image_url: str = "",
    hint: str = "",
) -> dict:
    from apps.shopie.services.packaging_analysis import PackagingAnalysisService

    return PackagingAnalysisService().run_job(
        job_id=job_id,
        front_image_url=front_image_url,
        back_image_url=back_image_url,
        hint=hint,
    )


@shared_task(name="shopie.send_pet_birthday_reminders")
def send_pet_birthday_reminders_task(lead_days: int = 5) -> dict[str, int]:
    from apps.shopie.services.pets import PetsService

    return PetsService().send_birthday_reminders(lead_days=lead_days)
