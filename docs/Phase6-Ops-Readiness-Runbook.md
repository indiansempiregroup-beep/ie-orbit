# Phase 6 Ops Readiness Runbook

## Scope

Phase 6 extends billing launch readiness with operator-facing observability and handoff tooling:

- Release gate and go-live checks
- Ops snapshot export (JSON/CSV)
- Trend and health scoring
- Plain-language ops digest
- Platform-level multi-tenant summary
- Scheduled digest delivery

## Key Endpoints

- `GET /api/v1/billing/go-live-check`
- `GET /api/v1/billing/release-gate`
- `GET /api/v1/billing/observability`
- `GET /api/v1/billing/ops-snapshot`
- `GET /api/v1/billing/ops-digest`
- `GET /api/v1/billing/platform-ops-summary` (platform admin only)

## Scheduled Digest Delivery

Configure these environment variables:

- `BILLING_OPS_DIGEST_ENABLED=true`
- `BILLING_OPS_DIGEST_RECIPIENTS=ops@example.com,eng@example.com`
- `BILLING_OPS_DIGEST_HOUR_UTC=2`

When enabled, Celery Beat schedules:

- `billing.send_ops_digest` once daily at `BILLING_OPS_DIGEST_HOUR_UTC:00` UTC.

## Incident Checklist

1. Open `/billing/release-gate` and verify blockers are empty.
2. Open `/billing/ops-snapshot` and review:
   - `health_score`
   - `trend`
   - `recommendations`
3. Use `/billing/ops-digest` to produce concise handoff text.
4. If platform admin, open `/billing/platform-ops-summary` for cross-tenant readiness.
5. Export `/billing/ops-snapshot?format=csv` for audit trails.

## Exit Criteria

- No blockers in release gate.
- Dead-letter backlog is zero.
- Failure trend is stable or improving.
- Daily ops digest recipients are configured and receiving reports.
