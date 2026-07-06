# Staff Management Developer Guide

Use `StaffRepository` for tenant-scoped reads, skills, and assignments. Use `StaffManagementService` for writes.

Creating a staff record automatically creates profile and employment detail foundation records. Skill and service assignment creation validates that staff and service belong to the same tenant and business.

Search supports `q`, `business`, `status`, `department`, and comma-separated `tags`.
