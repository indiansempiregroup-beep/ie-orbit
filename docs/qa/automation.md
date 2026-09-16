# Post-deploy QA automation

Run **after** VPS deploy (and after EAS APK install for native Maestro flows). Prefer **UAT** for mutating CRUD. Tests run from your laptop or GitHub Actions — they **target** the VPS; they do not run inside the UAT Docker stack.

## Tools

| Tool | Surfaces | When |
|------|----------|------|
| [Playwright](https://playwright.dev/) | Marketing, Platform Admin, ops web | After VPS deploy |
| [Maestro](https://maestro.mobile.dev/) | Ops + customer native APK | After EAS build installed on device/emulator |

Scenario mapping: [`scenarios/test-scenarios.md`](scenarios/test-scenarios.md) and [`FINDINGS.md`](FINDINGS.md) (`QA-###` IDs).

## One-time setup

1. **Credentials** — copy [`ie-orbit-qa-credentials.example.md`](ie-orbit-qa-credentials.example.md) to the IMP vault and create UAT QA users:
   - `~/Sanket/IMP/ie-orbit-qa-credentials.md`
2. **Playwright env** — `cp e2e/.env.example e2e/.env` and fill from IMP. The example defaults to **UAT** hosts.
3. **UAT OTP allowlist** — on the UAT VPS `.env` only (`DJANGO_DEBUG` stays `false`):

   ```
   AUTH_OTP_DEBUG_EMAILS=qa-owner@…,qa-admin@…
   ```

   Recreate backend after the change. Never set this in production.
4. **Seed the disposable tenant** (UAT only):

   ```bash
   docker compose -f docker-compose.uat.yml exec backend \
     python manage.py seed_e2e_qa_tenant \
       --owner-email "$QA_OWNER_EMAIL" \
       --staff-email "$QA_STAFF_EMAIL" \
       --admin-email "$QA_PLATFORM_ADMIN_EMAIL" \
       --customer-email "$QA_CUSTOMER_EMAIL"
   ```

5. **Maestro CLI** — `curl -Ls "https://get.maestro.mobile.dev" | bash`
6. **GitHub Actions secrets** (optional) — `QA_OWNER_EMAIL`, `QA_OWNER_PASSWORD`, `QA_CUSTOMER_EMAIL`, `QA_CUSTOMER_PASSWORD`, `QA_PLATFORM_ADMIN_EMAIL`, `QA_PLATFORM_ADMIN_PASSWORD`

## After VPS deploy

```bash
# UAT (from your laptop — see e2e/.env)
cp e2e/.env.example e2e/.env   # once; fill from IMP
./scripts/qa-post-deploy.sh --playwright-only
pnpm test:e2e:report           # open HTML report
```

Or trigger **Actions → E2E Post-Deploy → Run workflow**.

### Dispatch against UAT

Workflow inputs:

- `https://uat.ie-orbit.com`
- `https://ops-uat.ie-orbit.com`
- `https://app-uat.ie-orbit.com`
- `https://api-uat.ie-orbit.com/api/v1`

Production defaults stay on the workflow form. Do not run mutating customer CRUD against production.

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
e2e/smoke/                    Marketing + auth/register/contact
e2e/ops/                      Ops web (sign-in + customers CRUD)
e2e/admin/                    Platform Admin sign-in
mobile/.maestro/smoke/        Customer native flows
apps/ops-mobile/.maestro/smoke/  Ops native flows
scripts/qa-post-deploy.sh     Orchestrator
.github/workflows/e2e-post-deploy.yml  Manual CI runner
```
