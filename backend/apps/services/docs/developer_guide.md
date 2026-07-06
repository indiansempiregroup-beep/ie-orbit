# Service Catalog Developer Guide

Use `ServiceRepository` for tenant-scoped reads and search. Use `ServiceCatalogService` for category and service writes.

The API supports embedded `default_duration` and `default_price` on service create/update. Detailed variant, image, tax, and multiple price management can be expanded without changing the core service table.

Search supports `q`, `business`, `category`, `status`, `visibility`, and comma-separated `tags`.
