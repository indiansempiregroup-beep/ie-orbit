import { test, expect } from '@playwright/test';
import { qaEnv } from '../helpers/env';

async function signInWithOtp(page: import('@playwright/test').Page, email: string, code: string) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /sign in with otp/i }).click();
  await page.getByLabel(/sign-in code/i).fill(code);
  await page.getByRole('button', { name: /verify and sign in/i }).click();
}

test.describe('Ops workspace sign in', () => {
  test('owner can sign in and reach dashboard', async ({ page, request }) => {
    const { ownerEmail, apiUrl } = qaEnv();
    if (!ownerEmail) {
      test.skip(true, 'Set QA_OWNER_EMAIL in e2e/.env');
    }

    const sendRes = await request.post(`${apiUrl}/auth/otp/send`, {
      data: { client: 'ops', channel: 'email', identifier: ownerEmail },
    });
    expect(sendRes.ok()).toBeTruthy();
    const sendBody = await sendRes.json();
    const code = sendBody.data?.debug_code as string | undefined;
    if (!code) {
      test.skip(true, 'OTP debug_code not returned (enable DEBUG or use mail capture in CI)');
    }

    await page.goto('/');
    await signInWithOtp(page, ownerEmail, code!);

    await expect(page.getByText(/good (morning|afternoon|evening)|dashboard/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
