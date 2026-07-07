# Phase 5 Release Gate Runbook

## Purpose

This runbook defines the final preflight gate for billing launch readiness.
Use it immediately before production launch and during launch rehearsals.

## Endpoint

- `GET /api/v1/billing/release-gate`

The endpoint returns:

- `passed`: launch gate status (`true` when no blockers)
- `blockers` and `warnings`: IDs of failing checks
- `checks`: all checks with severity and remediation instructions
- `failing_checks`: only non-passing checks for quick triage
- `summary`: 24h operational context (events, failure rate, dead-letter, stuck retries)

## Gate Checks

- Razorpay API credentials configured (`blocker`)
- Webhook secret configured (`blocker`)
- Live checkout enforcement enabled (`warning`)
- No dead-letter backlog in last 24h (`blocker`)
- No stuck retries in last 24h (`warning`)
- Alert recipients configured (`warning`)
- Webhook failure rate below 5% over 24h (`warning`)

## Launch Decision

1. Call `GET /api/v1/billing/release-gate`.
2. If `passed=false`, do not launch. Resolve all blocker checks first.
3. Review warnings and decide if temporary risk acceptance is acceptable.
4. Re-run until `passed=true` and warning profile is acceptable.

## Suggested Automation

- CI/CD pre-deploy step:
  - Call the endpoint with a service account scoped to launch tenant.
  - Fail the pipeline on `passed=false`.
- Release checklist:
  - Attach endpoint payload snapshot to release ticket.
  - Record owner and ETA for any remaining warnings.
