from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.businesses.services.mobile_demo_seed import seed_mobile_demo_for_flavor, seed_rupali_mobile_demo


class Command(BaseCommand):
    help = "Seed mobile demo catalog data (categories, services, staff, hours) for a white-label business."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--flavor-key",
            default="rupali-s-business-rupali-s-business",
            help="White-label flavor key to seed (default: Rupali Sirsat).",
        )
        parser.add_argument(
            "--rupali",
            action="store_true",
            help="Shortcut for seeding Rupali Sirsat mobile demo data.",
        )

    def handle(self, *args, **options) -> None:
        try:
            if options["rupali"]:
                result = seed_rupali_mobile_demo()
            else:
                result = seed_mobile_demo_for_flavor(flavor_key=options["flavor_key"])
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                "Seeded mobile demo for {business_name} ({flavor_key}): "
                "{categories} categories, {services} services, {staff} staff, "
                "{images} images, {notification_templates} notification templates.".format(**result)
            )
        )
