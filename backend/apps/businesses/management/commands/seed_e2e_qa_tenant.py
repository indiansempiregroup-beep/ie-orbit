from __future__ import annotations

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.businesses.services.e2e_qa_seed import DEFAULT_TENANT_SLUG, seed_e2e_qa_tenant


class Command(BaseCommand):
    help = (
        "Create or update the dedicated UAT E2E QA tenant "
        "(owner, staff, platform admin, customer). "
        "Do not run against production."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--owner-email", default=os.getenv("E2E_QA_OWNER_EMAIL", "").strip())
        parser.add_argument("--staff-email", default=os.getenv("E2E_QA_STAFF_EMAIL", "").strip())
        parser.add_argument("--admin-email", default=os.getenv("E2E_QA_ADMIN_EMAIL", "").strip())
        parser.add_argument(
            "--customer-email",
            default=os.getenv("E2E_QA_CUSTOMER_EMAIL", "").strip(),
        )
        parser.add_argument(
            "--tenant-slug",
            default=os.getenv("E2E_QA_TENANT_SLUG", DEFAULT_TENANT_SLUG).strip(),
        )

    def handle(self, *args, **options) -> None:
        is_uat = any("-uat.ie-orbit.com" in host for host in settings.ALLOWED_HOSTS)
        if not settings.DEBUG and not is_uat:
            raise CommandError(
                "Refusing to seed outside UAT. The command only runs with DEBUG=true "
                "or an ALLOWED_HOSTS entry ending in -uat.ie-orbit.com."
            )
        owner_email = str(options["owner_email"] or "").strip()
        if not owner_email:
            raise CommandError("Pass --owner-email or set E2E_QA_OWNER_EMAIL.")
        try:
            result = seed_e2e_qa_tenant(
                owner_email=owner_email,
                staff_email=str(options["staff_email"] or ""),
                admin_email=str(options["admin_email"] or ""),
                customer_email=str(options["customer_email"] or ""),
                tenant_slug=str(options["tenant_slug"] or DEFAULT_TENANT_SLUG),
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS("E2E QA tenant ready:"))
        self.stdout.write(f"  tenant={result.tenant_slug} ({result.tenant_id})")
        self.stdout.write(f"  business={result.business_code} ({result.business_id})")
        self.stdout.write(f"  owner={result.owner_email}")
        if result.staff_email:
            self.stdout.write(f"  staff={result.staff_email}")
        if result.admin_email:
            self.stdout.write(f"  admin={result.admin_email}")
        if result.customer_email:
            self.stdout.write(f"  customer={result.customer_email}")
