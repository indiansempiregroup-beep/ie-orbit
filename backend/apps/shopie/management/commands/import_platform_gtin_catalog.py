from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.shopie.services.catalog_import.importer import PlatformCatalogImporter


class Command(BaseCommand):
    help = (
        "Seed PlatformGtinCatalog from OpenMRP dump and/or Open Food Facts "
        "(ODbL / OFF attribution required). Prefer --limit 1000 for first runs. "
        "Live barcode enrich also fills the catalog on demand."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--source",
            default="both",
            choices=("openmrp", "off", "open_food_facts", "both"),
            help="Data source (default: both).",
        )
        parser.add_argument("--limit", type=int, default=1000, help="Max products to upsert.")
        parser.add_argument(
            "--dump-dir",
            default="",
            help="Local OpenMRP dump directory containing brands/products/variants CSV.",
        )
        parser.add_argument(
            "--allow-missing-images",
            action="store_true",
            help="Import rows even when no image URL is present (default: require ≥1 image).",
        )
        parser.add_argument("--dry-run", action="store_true", help="Parse and count without writing.")

    def handle(self, *args, **options) -> None:
        importer = PlatformCatalogImporter()
        run = importer.run(
            source=options["source"],
            limit=int(options["limit"] or 1000),
            dump_dir=options["dump_dir"] or None,
            require_image=not options["allow_missing_images"],
            dry_run=bool(options["dry_run"]),
        )
        summary = importer.serialize_import_run(run)
        self.stdout.write(self.style.SUCCESS(f"Import {run.status}: {summary}"))
        quality = importer.quality_report()
        self.stdout.write(f"Quality: {quality}")
