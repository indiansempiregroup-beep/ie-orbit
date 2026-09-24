from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.businesses.services.demo_retail_pair_seed import seed_demo_retail_pair


class Command(BaseCommand):
    help = (
        "Seed local demo businesses: Paws & Whiskers (Orbit Appoint + Mart) and "
        "Heritage Antiques (Orbit Mart only), each with a separate owner."
    )

    def handle(self, *args, **options) -> None:
        try:
            rows = seed_demo_retail_pair()
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        for row in rows:
            self.stdout.write(
                self.style.SUCCESS(
                    "{display_name}: owner={owner_email} password={owner_password} "
                    "tenant={tenant_slug} flavor={flavor_key} products={products} "
                    "services={services} staff={staff} customers={customers} "
                    "zones={zones} coupons={coupons} pets={pets} bookings={bookings} "
                    "orders={orders} logo={logo}".format(**row)
                )
            )
