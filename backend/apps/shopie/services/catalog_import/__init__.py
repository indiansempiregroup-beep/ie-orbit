"""Catalog import package. Import PlatformCatalogImporter from .importer explicitly."""

__all__ = ["PlatformCatalogImporter"]


def __getattr__(name: str):
    if name == "PlatformCatalogImporter":
        from apps.shopie.services.catalog_import.importer import PlatformCatalogImporter

        return PlatformCatalogImporter
    raise AttributeError(name)
