# Phase 4 Webhook Operations Runbook

## Scope

This runbook covers operational handling of billing webhooks in Phase 4:

- Failure detection and triage
- Single and bulk reprocess actions
- Dead-letter handling

## Key Endpoints

- `GET /api/v1/billing/webhooks/summary`
- `GET /api/v1/billing/webhooks/events`
- `POST /api/v1/billing/webhooks/events/{event_id}/reprocess`
- `POST /api/v1/billing/webhooks/reprocess-bulk`

## Status Meanings

- `received`: webhook saved, not finalized yet
- `processed`: successfully handled
- `failed`: processing failed, retry pipeline active
- `dead_letter`: retries exhausted, manual action required
- `ignored`: event accepted but not actionable

## Bulk Reprocess Safety

- Requires permission: `business:manage`
- Requires explicit payload confirmation: `"confirm": true`
- Enforced cooldown per tenant+user: 60 seconds between bulk runs
- Max items per operation: 200

Example payload:

```json
{
  "scope": "dead_letter",
  "limit": 50,
  "confirm": true
}
```

## Suggested Incident Workflow

1. Open summary endpoint and review `failure_rate`, `dead_letter`, and `stuck_retries`.
2. Filter events by `failed` first; try targeted single-event reprocess for recent failures.
3. Run bulk retry for `failed` scope (limit 50).
4. If dead letters remain, run bulk retry for `dead_letter` scope.
5. If events keep returning to dead-letter:
   - inspect `error_message`
   - check credential and webhook signature configuration
   - validate product plan and business subscription state

## Alerts and Signals

- Domain events emitted:
  - `billing.webhook.failed`
  - `billing.webhook.dead_letter`
- Optional email alerts controlled by `BILLING_WEBHOOK_ALERT_RECIPIENTS`
