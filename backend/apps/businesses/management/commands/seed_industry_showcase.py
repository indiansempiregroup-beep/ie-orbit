from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.businesses.services.industry_showcase_seed import seed_industry_showcase


class Command(BaseCommand):
    help = (
        "Seed lightweight showcase workspaces for Industries-page verticals "
        "(clinic, fitness, professional, retail, education, home)."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--json",
            action="store_true",
            help="Print tenant/business/flavor metadata as JSON for capture scripts.",
        )

    def handle(self, *args, **options) -> None:
        try:
            rows = seed_industry_showcase()
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        if options["json"]:
            self.stdout.write(json.dumps(rows, indent=2))
            return

        for row in rows:
            self.stdout.write(
                self.style.SUCCESS(
                    "{display_name} ({flavor_key}) tenant={tenant_id} business={business_id} "
                    "services={services} catalog={catalog} bookings={bookings} orders={orders}".format(**row)
                )
            )
