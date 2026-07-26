from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.businesses.services.dashboard_demo_seed import DEFAULT_FLAVOR_KEY, seed_dashboard_demo


class Command(BaseCommand):
    help = (
        "Seed a screenshot-ready Demo Salon workspace: pilot tenant, catalog/staff, "
        "branches, customers, bookings, reviews, notifications, and loyalty."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--flavor-key",
            default=DEFAULT_FLAVOR_KEY,
            help=f"White-label flavor key to seed (default: {DEFAULT_FLAVOR_KEY}).",
        )

    def handle(self, *args, **options) -> None:
        flavor_key = options["flavor_key"]
        try:
            result = seed_dashboard_demo(flavor_key=flavor_key)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded dashboard demo for {business_name} ({flavor_key}): "
                "{branches} branches, {customers} customers, "
                "{bookings_total} bookings ({bookings_created} created / {bookings_updated} updated), "
                "{reviews} new reviews, {notifications} notifications, "
                "{services} services, {staff} staff.".format(**result)
            )
        )
        login = result["login"]
        self.stdout.write(
            self.style.WARNING(
                f"Owner login: {login['email']} / {login['password']} "
                f"(workspace {result['tenant_slug']}/{result['business_code']}, "
                f"plan={result['plan_code']}, status={result['subscription_status']})"
            )
        )
        manager = result.get("manager")
        if manager:
            self.stdout.write(
                self.style.WARNING(
                    f"Manager login: {manager['email']} / {manager['password']} "
                    f"(staff_code={manager['staff_code']})"
                )
            )
