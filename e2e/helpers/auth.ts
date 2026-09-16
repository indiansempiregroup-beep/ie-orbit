import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { qaEnv } from './env';

type OtpClient = 'ops' | 'customer';

type JsonEnvelope<T> = { data?: T };

async function readData<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as JsonEnvelope<T>;
  return body.data as T;
}

export async function requestOtpDebugCode(
  request: APIRequestContext,
  email: string,
  client: OtpClient = 'ops',
): Promise<string | undefined> {
  const { apiUrl } = qaEnv();
  const sendRes = await request.post(`${apiUrl}/auth/otp/send`, {
    data: { client, channel: 'email', identifier: email },
  });
  if (!sendRes.ok()) {
    throw new Error(`OTP send failed (${sendRes.status()}): ${await sendRes.text()}`);
  }
  const data = await readData<{ debug_code?: string }>(sendRes);
  return data?.debug_code;
}

export async function fillOtpSignIn(page: Page, email: string, code: string) {
  await page.getByLabel(/email/i).or(page.getByTestId('field-email')).fill(email);
  await page.getByRole('button', { name: /sign in with otp/i }).click();
  await page.getByLabel(/sign-in code/i).or(page.getByTestId('field-sign-in-code')).fill(code);
  await page.getByRole('button', { name: /verify and sign in/i }).click();
}

export async function signInOpsWeb(page: Page, email = qaEnv().ownerEmail) {
  if (!email) {
    throw new Error('QA_OWNER_EMAIL is required for ops sign-in.');
  }
  const code = await requestOtpDebugCode(page.request, email, 'ops');
  if (!code) {
    return false;
  }
  await page.goto('/');
  await fillOtpSignIn(page, email, code);
  await expect(page.getByText(/good (morning|afternoon|evening)|dashboard/i).first()).toBeVisible({
    timeout: 30_000,
  });
  return true;
}

export async function signInAdminWeb(page: Page, email = qaEnv().platformAdminEmail) {
  if (!email) {
    throw new Error('QA_PLATFORM_ADMIN_EMAIL is required for admin sign-in.');
  }
  const code = await requestOtpDebugCode(page.request, email, 'ops');
  if (!code) {
    return false;
  }
  await page.goto('/auth');
  await fillOtpSignIn(page, email, code);
  await expect(page.getByText(/platform admin/i).first()).toBeVisible({ timeout: 30_000 });
  return true;
}

export type OpsApiSession = {
  access: string;
  tenantId: string;
  businessId: string;
};

export async function apiOpsSession(
  request: APIRequestContext,
  email = qaEnv().ownerEmail,
): Promise<OpsApiSession | null> {
  if (!email) return null;
  const { apiUrl } = qaEnv();
  const code = await requestOtpDebugCode(request, email, 'ops');
  if (!code) return null;

  const verifyRes = await request.post(`${apiUrl}/auth/otp/verify`, {
    data: {
      client: 'ops',
      channel: 'email',
      identifier: email,
      code,
      remember_me: true,
    },
  });
  if (!verifyRes.ok()) {
    throw new Error(`OTP verify failed (${verifyRes.status()}): ${await verifyRes.text()}`);
  }
  const tokens = await readData<{ access: string }>(verifyRes);
  const auth = { Authorization: `Bearer ${tokens.access}` };

  const tenantsRes = await request.get(`${apiUrl}/tenants`, { headers: auth });
  if (!tenantsRes.ok()) {
    throw new Error(`Tenants list failed (${tenantsRes.status()}): ${await tenantsRes.text()}`);
  }
  const tenants = await readData<Array<{ id: string }>>(tenantsRes);
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) return null;

  const businessesRes = await request.get(`${apiUrl}/businesses`, {
    headers: { ...auth, 'X-Tenant-ID': tenantId },
  });
  if (!businessesRes.ok()) {
    throw new Error(`Businesses list failed (${businessesRes.status()}): ${await businessesRes.text()}`);
  }
  const businesses = await readData<Array<{ id: string }>>(businessesRes);
  const businessId = businesses?.[0]?.id;
  if (!businessId) return null;

  return { access: tokens.access, tenantId, businessId };
}

export function opsApiHeaders(session: OpsApiSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.access}`,
    'X-Tenant-ID': session.tenantId,
    'X-Business-ID': session.businessId,
  };
}
