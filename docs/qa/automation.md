# Post-deploy QA automation

Run **after** VPS deploy (and after EAS APK install for native Maestro flows). No local pre-push test runs required.

## Tools

| Tool | Surfaces | When |
|------|----------|------|
| [Playwright](https://playwright.dev/) | `ie-orbit.com`, `app.ie-orbit.com` auth flows, `ops.ie-orbit.com` web | Right after VPS deploy |
| [Maestro](https://maestro.mobile.dev/) | Ops + customer native APK | After EAS build installed on device/emulator |

Scenario mapping: [`scenarios/test-scenarios.md`](scenarios/test-scenarios.md) and [`FINDINGS.md`](FINDINGS.md) (`QA-###` IDs).

## One-time setup

1. **Credentials** — copy template to IMP vault and create prod QA users:
   - `~/Sanket/IMP/ie-orbit-qa-credentials.md` (from `ie-orbit-qa-credentials.example.md`)
2. **Playwright env** — `cp e2e/.env.example e2e/.env` and fill from IMP
3. **Maestro CLI** — `curl -Ls "https://get.maestro.mobile.dev" | bash`
4. **GitHub Actions secrets** (optional) — `QA_OWNER_EMAIL`, `QA_OWNER_PASSWORD`, `QA_CUSTOMER_EMAIL`, `QA_CUSTOMER_PASSWORD`

## After VPS deploy

```bash
ssh ie-orbit-vps   # deploy first (see Commands to Run.txt)
# back on your machine:
git pull origin main
cp e2e/.env.example e2e/.env   # once
./scripts/qa-post-deploy.sh --playwright-only
pnpm test:e2e:report           # open HTML report
```

Or trigger **Actions → E2E Post-Deploy → Run workflow** (Playwright only).

## After EAS APK install

```bash
source e2e/.env
export APP_ID=com.ieorbit.ops          # ops APK
maestro test apps/ops-mobile/.maestro/smoke/

export APP_ID=com.ieorbit.mobile.dev   # customer flavor — check flavors/manifest.json
maestro test mobile/.maestro/smoke/
```

Or full script (Playwright + Maestro when CLI + creds present):

```bash
./scripts/qa-post-deploy.sh
```

## Triage failures

1. Note failing test name (prefer `QA-###` in title when mapped)
2. Add or update entry in [`FINDINGS.md`](FINDINGS.md)
3. Link Playwright trace/screenshot from `test-results/` or CI artifact

## Layout

```
e2e/                          Playwright config + specs
mobile/.maestro/smoke/        Customer native flows
apps/ops-mobile/.maestro/smoke/  Ops native flows
scripts/qa-post-deploy.sh     Orchestrator
.github/workflows/e2e-post-deploy.yml  Manual CI runner
```
