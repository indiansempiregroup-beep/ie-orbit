# QA documentation for IE Orbit

This folder is the **source of truth for Cursor agents** when triaging bugs, suggestions, and test coverage. Markdown files here are what agents read — not the PDF or Excel originals.

## Folder layout

| Path | Purpose |
|------|---------|
| [`FINDINGS.md`](FINDINGS.md) | Backlog: open bugs, suggestions, and recently resolved items (use `QA-###` IDs) |
| [`findings/`](findings/) | Daily raw notes from QA — paste here first, then normalize into `FINDINGS.md` |
| [`scenarios/test-scenarios.md`](scenarios/test-scenarios.md) | Test scenario matrix (export of the Excel sheet) |
| [`archive/`](archive/) | Monthly rollups of resolved items (optional) |
| `Execution.pdf`, `IE_Orbit_TewstScenarios_v1.xlsx` | QA working copies; agents prefer markdown |

## For QA team

When reporting findings, include:

1. **Area** (e.g. Create Account, Home page, Forgot password)
2. **Steps to reproduce**
3. **Expected vs actual**
4. **Severity** if known: blocked (P0), major (P1), minor (P2), or suggestion
5. **Screenshots or screen recording** (share separately; do not put secrets in this repo)

Send daily notes to Sanket via your usual channel (chat, email, sheet). Sanket adds them to this repo.

## For Sanket — daily sync

1. **Paste** QA’s raw notes into `findings/YYYY-MM-DD.md` (any format is fine).
2. **Normalize** each item into [`FINDINGS.md`](FINDINGS.md) using the template:

```markdown
## QA-018 | P2 | open | Auth / Sign-up
- **Area:** …
- **Steps:** …
- **Expected:** …
- **Actual:** …
- **Source:** findings/2026-09-02.md
- **Notes:** —
```

3. **Update status** when fixed: change `open` → `resolved` and add a one-line note under **Notes**.
4. **Commit** markdown files when you want them on git / for automations (optional for local-only work).

## Using Cursor

Reference this backlog in Agent chat:

| Goal | Prompt example |
|------|----------------|
| Triage all open bugs | `@docs/qa/FINDINGS.md triage open bugs` |
| Fix one item | `@docs/qa/FINDINGS.md fix QA-004` |
| Batch fix by severity | `Read docs/qa and fix all P0/P1 open items` |
| Test coverage | `@docs/qa/scenarios/test-scenarios.md list FAIL cases` |

Opening any file under `docs/qa/` also loads the project’s QA Cursor rule for context.

## IDs and severity

- **IDs:** `QA-001`, `QA-002`, … — never reuse; increment for new items.
- **Severity:** `P0` (blocked) · `P1` (major) · `P2` (minor) · `suggestion`
- **Status:** `open` · `in_progress` · `resolved` · `won't_fix`

## Security

Do not put credentials, `.env` values, or production URLs with tokens in QA docs. Use test accounts and local/staging hosts only.
