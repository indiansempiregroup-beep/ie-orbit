from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.businesses.services.pilot_seed import (
    PILOT_FLAVORS,
    seed_all_white_label_profiles,
    seed_pilot_white_label_profiles,
)


class Command(BaseCommand):
    help = "Seed business-level white-label profiles and optional pilot demo tenants."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--create-pilot",
            action="store_true",
            help="Create/update pilot tenants (demo + empire-salon) with branded mobile profiles.",
        )
        parser.add_argument(
            "--all-businesses",
            action="store_true",
            help="Ensure white-label profiles exist for all businesses.",
        )

    def handle(self, *args, **options) -> None:
        create_pilot = bool(options["create_pilot"])
        all_businesses = bool(options["all_businesses"])

        if not create_pilot and not all_businesses:
            create_pilot = True
            all_businesses = True

        if all_businesses:
            count = seed_all_white_label_profiles()
            self.stdout.write(self.style.SUCCESS(f"Ensured white-label profiles for {count} business(es)."))

        if create_pilot:
            rows = seed_pilot_white_label_profiles()
            self.stdout.write(self.style.SUCCESS("Pilot white-label profiles ready:"))
            for row in rows:
                self.stdout.write(
                    f"  - {row['app_name']}: flavor_key={row['flavor_key']} "
                    f"({row['tenant_slug']}/{row['business_code']})"
                )
            self.stdout.write(
                self.style.WARNING(
                    "Pilot owner login: pilot-owner@ieorbit.local / PilotPass123! "
                    f"({len(PILOT_FLAVORS)} flavors configured)"
                )
            )
