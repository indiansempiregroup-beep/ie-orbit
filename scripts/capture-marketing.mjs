import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web/public/marketing');
const API = process.env.IE_API_BASE ?? 'http://localhost:8000/api/v1';
const OPS_URL = process.env.IE_OPS_URL ?? 'http://localhost:8082';
const CUSTOMER_URL = process.env.IE_CUSTOMER_URL ?? 'http://localhost:8083';
const OPS_EMAIL = process.env.IE_OPS_EMAIL ?? 'pilot-owner@ieplatform.local';
const CUSTOMER_EMAIL = process.env.IE_SHOWCASE_CUSTOMER ?? 'showcase-customer@example.com';

function composeExec(args) {
  const cmd = `podman compose exec -T backend ${args}`;
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function seedShowcases() {
  const raw = composeExec('python manage.py seed_industry_showcase --json');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < 0) {
    throw new Error(`Could not parse seed JSON:\n${raw}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

async function otpLogin(client, identifier, extra = {}) {
  const sendRes = await fetch(`${API}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client, channel: 'email', identifier, ...extra }),
  });
  const sendJson = await sendRes.json();
  const code = sendJson?.data?.debug_code;
  if (!code) throw new Error(`No debug_code for ${identifier}: ${JSON.stringify(sendJson)}`);
  const verifyRes = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client,
      channel: 'email',
      identifier,
      code,
      remember_me: true,
      ...extra,
    }),
  });
  const verifyJson = await verifyRes.json();
  if (!verifyJson?.data?.access) {
    throw new Error(`OTP verify failed for ${identifier}: ${JSON.stringify(verifyJson)}`);
  }
  return verifyJson.data;
}

async function hideOverlays(page) {
  await page.addStyleTag({
    content: `
      [data-testid="dev-server-error"],
      #dev-menu, #__devtools-indicator,
      iframe[src*="debugger"],
      div[style*="Open in editor"] { display: none !important; }
    `,
  });
}

async function shot(page, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await page.screenshot({ path: dest, type: 'png' });
  console.log('wrote', dest, fs.statSync(dest).size);
}

async function switchOpsWorkspace(page, row) {
  await page.evaluate(
    ({ tenantId, businessId }) => {
      localStorage.setItem('ie.ops.active-tenant-id', tenantId);
      localStorage.setItem('ie.ops.active-business-id', businessId);
      localStorage.setItem('ie:active-tenant-id', tenantId);
      localStorage.setItem('ie:active-business-id', businessId);
    },
    { tenantId: row.tenant_id, businessId: row.business_id },
  );
  await page.goto(`${OPS_URL}/`, { waitUntil: 'domcontentloaded' });
  await hideOverlays(page);
  const picker = page.getByText('Choose workspace');
  if (await picker.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByText(row.display_name, { exact: false }).first().click();
  }
  await page.getByText(row.display_name, { exact: false }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function captureOps(opsPage, row, dir) {
  const hasCalendar = (row.products ?? []).includes('appointie');
  await switchOpsWorkspace(opsPage, row);
  await shot(opsPage, path.join(dir, 'ops-dashboard.png'));
  if (!hasCalendar) return;
  const calendar = opsPage.getByText('Calendar', { exact: true }).first();
  if (!(await calendar.isVisible({ timeout: 4000 }).catch(() => false))) return;
  await calendar.click();
  await opsPage.waitForTimeout(2000);
  await shot(opsPage, path.join(dir, 'ops-calendar.png'));
}

async function captureCustomer(browser, row, dir) {
  const hasShop = (row.products ?? []).includes('shopie');
  const customerTokens = await otpLogin('customer', row.customer_email || CUSTOMER_EMAIL, {
    tenant_slug: row.tenant_slug,
    business_code: row.business_code,
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await mobile.newPage();
  const url = `${CUSTOMER_URL}/?flavor_key=${encodeURIComponent(row.flavor_key)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ access, refresh }) => {
      localStorage.setItem('ie.mobile.access', access);
      localStorage.setItem('ie.mobile.refresh', refresh);
    },
    { access: customerTokens.access, refresh: customerTokens.refresh },
  );
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await hideOverlays(page);
  await page.waitForTimeout(2500);
  await page.getByText('Asha').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot(page, path.join(dir, 'customer-home.png'));
  if (hasShop) {
    const shopTab = page.getByText('Shop', { exact: true }).first();
    if (await shopTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shopTab.click();
      await page.waitForTimeout(2500);
      await shot(page, path.join(dir, 'customer-shop.png'));
    }
  }
  await mobile.close();
}

async function main() {
  const rows = process.argv.includes('--skip-seed') ? [] : seedShowcases();
  if (!rows.length && !process.argv.includes('--skip-seed')) {
    throw new Error('Seed returned no showcase businesses.');
  }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const opsTokens = await otpLogin('ops', OPS_EMAIL);
  const ops = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const opsPage = await ops.newPage();
  await opsPage.goto(`${OPS_URL}/`, { waitUntil: 'domcontentloaded' });
  await opsPage.evaluate(
    ({ access, refresh }) => {
      localStorage.setItem('ie.ops.access', access);
      localStorage.setItem('ie.ops.refresh', refresh);
    },
    { access: opsTokens.access, refresh: opsTokens.refresh },
  );
  await opsPage.reload({ waitUntil: 'domcontentloaded' });
  await hideOverlays(opsPage);

  for (const row of rows) {
    const dir = path.join(OUT, 'industries', row.industry_slug);
    console.log('capturing', row.display_name, row.flavor_key);
    await captureOps(opsPage, row, dir);
    await captureCustomer(browser, row, dir);
  }

  await ops.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
