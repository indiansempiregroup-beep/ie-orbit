# Customer Management Developer Guide

Use `CustomerRepository` for tenant-scoped reads and `CustomerService` for writes.

To create a customer through code, pass validated data with a tenant and actor to `CustomerService.create_customer(...)`. The service creates empty profile and preference records automatically.

Search supports `q`, `business`, `status`, and comma-separated `tags`. Archive uses soft delete and can be restored through the restore endpoint.
