from apps.shopie.services.books import BooksService
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.einvoice.service import GstComplianceService
from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.pets import PetsService
from apps.shopie.services.returns import ReturnService
from apps.shopie.services.suppliers import SupplierService
from apps.shopie.services.zones import DeliveryZoneService

__all__ = [
    "BooksService",
    "CatalogService",
    "GstComplianceService",
    "ProductEnrichmentService",
    "OrderService",
    "PetsService",
    "ReturnService",
    "SupplierService",
    "DeliveryZoneService",
]
