# Platform Architecture Evolution — Refactoring Report

**Date:** 2026-07-07  
**Milestone:** Architectural evolution (pre-M12.1)  
**Scope:** Analysis + safe incremental changes only

---

## Executive Summary

The IE Platform **already implements most Platform Core responsibilities** in separate Django apps. This milestone formalizes the architecture without rewriting code. Safe changes applied: workspace UX, domain registries, ADRs, reports placeholder, SDK type.

---

## Modules Already Satisfying Target Architecture

| Target | Current Implementation | Alignment |
|--------|------------------------|-----------|
| Business (Platform Core) | `businesses` app | ✅ Full |
| Customer (business-scoped) | `customers` app | ✅ Full |
| Staff (business-scoped) | `staff` app | ✅ Full |
| Service Catalog | `services` app | ✅ Full |
| Users / IAM | `authentication` app | ✅ Full |
| Media | `platform_media` app | ✅ Full |
| Multi-product subscriptions | `BusinessProductSubscription` | ✅ Ahead of docs |
| AppointIE bookings | `bookings` app | ✅ Correct layer |
| Workspace session | `WorkspaceContext` | ✅ Partial (UX refined) |

---

## Modules That Should Remain Product-Specific

| Module | Stays In | Reason |
|--------|----------|--------|
| Bookings, availability, schedules | `bookings` | AppointIE operational |
| Calendar connections | `calendar` | AppointIE integration |
| Invoices, quotations, payments | `shopie` | ShopIE Billing |

---

## Modules That Should Move to Platform Core (Future Only)

| Module | Current | Future Action | Safe Now? |
|--------|---------|---------------|-----------|
| Audit | Placeholder `audit/` | Implement unified audit log | ❌ Document only |
| Branches | Not modeled | Add under `businesses` | ❌ Document only |
| Custom fields | Partial (tags) | Unified custom field engine | ❌ Document only |
| Analytics aggregates | Placeholder | Platform engine | ❌ Document only |

**No moves performed** — existing app boundaries are correct.

---

## Refactoring Performed (Safe)

| Change | Files | Risk |
|--------|-------|------|
| Workspace label `Product · Business` | `AppShellHeader.tsx`, `Layout.tsx`, `workspaceModel.ts` | Low |
| Product-first workspace switcher order | `AppShellHeader.tsx` | Low |
| Business Profile under Settings nav | `SettingsLayout.tsx` | Low |
| Platform domain registry | `platform.ts`, `registry.py` | None |
| Reports placeholder | `ReportsPage.tsx` | Low (fixes broken route) |
| SDK `WorkspaceSnapshot` | `packages/sdk/src/index.ts` | None (additive) |
| Notifications bell → `/notifications` | `AppShellHeader.tsx` | Low |

---

## Refactoring Deferred (Documented)

| Item | Reason |
|------|--------|
| Consolidate `dashboardApi` vs `managementApi` | Requires careful query-key migration |
| Remove duplicate `slugify` helpers | Low priority |
| Wire `FeatureGuard` on routes | Needs permission matrix |
| Tenant picker UI | Platform-admin scope |
| Merge dual role systems | ADR-004 — future milestone |

---

## Phase 4 Completion Snapshot

Phase 4 hardening is complete for billing operations and IAM-integrated administration:

| Capability | Status |
|------------|--------|
| Razorpay-ready billing service + checkout + webhook ingestion | ✅ Done |
| Webhook idempotency, replay, dead-letter handling | ✅ Done |
| Automated retry scheduling with cooldown-aware operations controls | ✅ Done |
| Bulk remediation endpoints (failed/dead-letter) with audit trail | ✅ Done |
| Billing operations summary metrics and stuck-retry indicators | ✅ Done |
| Team IAM + invitation operational flows | ✅ Done |
| Runbook for webhook operations | ✅ Done |

Remaining post-Phase-4 work is primarily productization/polish (billing plan economics, branding upload in onboarding, and advanced observability integrations).

---

## Duplicate Domains Identified

| Duplication | Location | Recommendation |
|-------------|----------|----------------|
| Business profile fetch | `dashboardHooks` + `businessSettingsHooks` | Phase 1: unify hook |
| Customer/Staff/Service list API | `dashboardApi` + `managementApi` | Phase 1: scope management by workspace |
| Tenant settings vs Business fields | `tenants.settings` + `Business` | Document overlap; consolidate in Phase 2 |
| Platform Role vs BusinessRole | `authentication` + `staff` | ADR-004: retain until unified auth milestone |
| `slugify` | `provisionWorkspace.ts`, `workspace.ts` | Inline dedup in Phase 1 |

---

## Self-Review Checklist

- [x] No duplicate Django models created
- [x] No API paths changed
- [x] No migrations added
- [x] No working functionality removed
- [x] Orphan routes fixed (reports)
- [x] Tenant hidden from user-facing UI
- [x] ADRs created for key decisions
