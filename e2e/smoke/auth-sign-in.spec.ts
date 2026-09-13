import { test, expect } from '@playwright/test';
import { qaEnv } from '../helpers/env';

async function signInWithOtp(page: import('@playwright/test').Page, email: string, code: string) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /sign in with otp/i }).click();
  await page.getByLabel(/sign-in code/i).fill(code);
  await page.getByRole('button', { name: /verify and sign in/i }).click();
}

test.describe('Sign in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('invalid OTP shows error', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid-user@example.com');
    await page.getByRole('button', { name: /sign in with otp/i }).click();
    await page.getByLabel(/sign-in code/i).fill('000000');
    await page.getByRole('button', { name: /verify and sign in/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('valid owner OTP redirect after sign in', async ({ page, request }) => {
    const { ownerEmail } = qaEnv();
    if (!ownerEmail) {
      test.skip(true, 'Set QA_OWNER_EMAIL in e2e/.env');
    }

    const sendRes = await request.post('/api/v1/auth/otp/send', {
      data: { client: 'ops', channel: 'email', identifier: ownerEmail },
    });
    expect(sendRes.ok()).toBeTruthy();
    const sendBody = await sendRes.json();
    const code = sendBody.data?.debug_code as string | undefined;
    if (!code) {
      test.skip(true, 'OTP debug_code not returned (enable DEBUG or use mail capture in CI)');
    }

    await signInWithOtp(page, ownerEmail, code);
    await expect(page).not.toHaveURL(/\/auth$/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('signed-out query clears leftover session so Sign in stays on the login form', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ie:auth:access', 'leftover-access');
      localStorage.setItem('ie:auth:refresh', 'leftover-refresh');
    });
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'user-1',
            email: 'previous@example.com',
            full_name: 'Previous User',
            roles: ['owner'],
          },
        }),
      });
    });
    await page.goto('/auth?signed-out=1');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByText(/opening your workspace/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/auth$/);
  });
});
