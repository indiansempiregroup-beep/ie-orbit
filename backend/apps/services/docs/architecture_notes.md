# Service Catalog Architecture Notes

The service catalog owns service definitions only. Booking, availability, working hours, payment, and package execution remain outside this module.

Service records are tenant- and business-scoped, with category, variant, duration, pricing, tax, image, and tag subdomains. Media is integrated through `platform_media.Media`.

`ServiceCatalogService` creates default duration and price foundation records so future booking engines can resolve a baseline service shape.
