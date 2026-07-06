# Staff Management Architecture Notes

The staff module models operational workers and their relationships to services. It does not implement availability, schedules, bookings, payroll, or notifications.

Staff, skills, assignments, documents, certifications, and notes inherit from `TenantModel`. `BusinessRole` is global reference data seeded by migration for standard business roles while remaining extensible for future custom roles.

Staff photos, documents, and certificates use `platform_media.Media`.
