# Technical Debt Report — Platform Architecture Evolution

**Date:** 2026-07-07

## Critical (Address in Next Milestone)

| ID | Debt | Impact | Effort |
|----|------|--------|--------|
| TD-01 | Frontend API scoping split (dashboard vs management) | Wrong data when switching business | Medium |
| TD-02 | No `request.current_business` in middleware | Analytics/calendar views use `getattr` fallback | Medium |
| TD-03 | Dual role systems (IAM vs BusinessRole) | Developer confusion, incomplete guards | High |

## High

| ID | Debt | Impact | Effort |
|----|------|--------|--------|
| TD-04 | Zero approved ADRs before this milestone | Architecture drift | Low (partially resolved) |
| TD-05 | IE-0004A / IE-0006 not in MkDocs nav | Docs discoverability | Low |
| TD-06 | Organization entity not in database blueprint | Doc/code mismatch | Low (update docs) |
| TD-07 | `BusinessProductSubscription` not in IE-0006 | Doc/code mismatch | Low (update docs) |

## Medium

| ID | Debt | Impact | Effort |
|----|------|--------|--------|
| TD-08 | Placeholder apps: `audit`, `workflow`, `analytics` | Documented engines missing | High |
| TD-09 | Booking uses UUID refs not FKs | No DB-level referential integrity | Medium |
| TD-10 | Orphan frontend files (`BusinessPage`, `BusinessProfilePage`) | Maintenance noise | Low |
| TD-11 | Global search non-functional in header | UX gap | Medium |
| TD-12 | No tenant switcher for multi-tenant owners | Power-user limitation | Medium |

## Low

| ID | Debt | Impact | Effort |
|----|------|--------|--------|
| TD-13 | Duplicate `slugify` helpers | Minor DRY violation | Low |
| TD-14 | Duplicate business profile React Query keys | Extra network requests | Low |
| TD-15 | `FeatureGuard`/`RoleGuard` not wired in routes | Unused code | Low |
| TD-16 | ESLint not in web package scripts deps | CI gap | Low |

## Platform Engines (Documented Debt from IE-0004A)

Not implemented — tracked as future milestones, not regressions:

- Event Bus
- Workflow Engine  
- Reporting Engine (placeholder page only)
- Search Engine
- AI Engine
- Analytics domain tables

## Branch Entity Gap

Target architecture includes **Branches** under Business. Not modeled. Required before multi-location businesses.

## Recommended Prioritization

1. **TD-01** — Unify workspace-scoped API hooks (highest user-visible impact)
2. **TD-02** — Business context middleware (enables correct server scoping)
3. **TD-05/TD-06/TD-07** — Refresh IE-0006 to match implementation
4. **TD-08** — Platform engines per product roadmap phase
