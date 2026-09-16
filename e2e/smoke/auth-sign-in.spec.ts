import { test, expect } from '@playwright/test';
import { fillOtpSignIn, requestOtpDebugCode } from '../helpers/auth';
import { qaEnv } from '../helpers/env';

test.describe('Sign in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('invalid OTP shows error', async ({ page }) => {
    const { ownerEmail } = qaEnv();
    if (!ownerEmail) {
      test.skip(true, 'Set QA_OWNER_EMAIL in e2e/.env');
    }
    await page.getByLabel(/email/i).fill(ownerEmail);
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

    const code = await requestOtpDebugCode(request, ownerEmail, 'ops');
    if (!code) {
      test.skip(true, 'OTP debug_code not returned (set AUTH_OTP_DEBUG_EMAILS on UAT)');
    }

    await fillOtpSignIn(page, ownerEmail, code!);
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
