from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.businesses.services.sanket_pet_shop_seed import FLAVOR_KEY, seed_sanket_pet_shop


class Command(BaseCommand):
    help = "Seed grooming services and pet products for Sanket Pet Shop."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--flavor-key",
            default=FLAVOR_KEY,
            help=f"White-label flavor key to seed (default: {FLAVOR_KEY}).",
        )

    def handle(self, *args, **options) -> None:
        try:
            result = seed_sanket_pet_shop(flavor_key=options["flavor_key"])
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                "Seeded {business_name} ({flavor_key}): "
                "{categories} categories, {services} services, {service_images} images, "
                "{products} products, {staff} staff.".format(**result)
            )
        )
