import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { apiOpsSession, opsApiHeaders, type OpsApiSession } from './auth';
import { qaEnv } from './env';

function asRows(payload: unknown): Array<{ id: string; display_name?: string; email?: string }> {
  if (Array.isArray(payload)) return payload as Array<{ id: string; display_name?: string; email?: string }>;
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: Array<{ id: string }> }).results;
  }
  return [];
}

export async function cleanupCustomersByPrefix(
  request: APIRequestContext,
  prefix: string,
  session?: OpsApiSession | null,
): Promise<void> {
  const active = session ?? (await apiOpsSession(request));
  if (!active) return;
  const { apiUrl } = qaEnv();
  const listRes = await request.get(`${apiUrl}/customers`, {
    headers: opsApiHeaders(active),
    params: { q: prefix, business: active.businessId },
  });
  if (!listRes.ok()) return;
  const body = (await listRes.json()) as { data?: unknown };
  const rows = asRows(body.data).filter((row) => {
    const haystack = `${row.display_name ?? ''} ${row.email ?? ''}`.toLowerCase();
    return haystack.includes(prefix.toLowerCase());
  });
  await Promise.all(
    rows.map((row) =>
      request.delete(`${apiUrl}/customers/${row.id}`, { headers: opsApiHeaders(active) }),
    ),
  );
}

export async function openCustomersAddForm(page: Page) {
  const nav = page.getByTestId('nav-customers');
  if (await nav.count()) {
    await nav.click();
  } else {
    await page.getByRole('button', { name: /^customers$/i }).first().click();
  }
  await page.getByTestId('customers-add').click();
  await expect(page.getByText(/add customer/i).first()).toBeVisible({ timeout: 15_000 });
}
