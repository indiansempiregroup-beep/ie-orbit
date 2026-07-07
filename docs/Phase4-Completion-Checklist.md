# Phase 4 Completion Checklist

## Objective

Close Phase 4 with production-safe billing operations, tenant-safe IAM controls, and operational runbooks.

## Completion Matrix

- [x] Razorpay-ready billing scaffold with mock-safe fallback
- [x] Checkout + webhook ingestion endpoints
- [x] Webhook event ledger with status transitions (`received`, `processed`, `failed`, `dead_letter`)
- [x] Idempotent webhook processing using provider event identifiers
- [x] Single-event reprocess endpoint
- [x] Bulk reprocess endpoint (`failed` and `dead_letter` scopes)
- [x] Bulk safeguards:
  - [x] explicit confirmation flag required
  - [x] cooldown per tenant+user
  - [x] bounded request limits
- [x] Retry scheduling with bounded retry ladder
- [x] Dead-letter transition after retry exhaustion
- [x] Failure + dead-letter domain events
- [x] Optional failure alerting via configured recipients
- [x] Billing operations summary endpoint
- [x] UI operations panel:
  - [x] summary counters
  - [x] stuck-retry warning
  - [x] event filters
  - [x] single reprocess
  - [x] bulk reprocess actions
- [x] Audit logging for privileged bulk operations
- [x] Billing operations runbook documented

## Validation Evidence (latest)

- Backend billing tests: passing (`apps/billing/tests/test_billing_api.py`)
- Web build: passing (`pnpm --dir web build` in Docker)
- Lints on touched files: clean

## Exit Criteria

Phase 4 is considered complete when:

1. Billing operations can identify, retry, and escalate webhook failures without code changes.
2. Privileged remediation actions are auditable and rate-limited.
3. Runbook steps are sufficient for on-call/operator execution.

All three criteria are now satisfied.
