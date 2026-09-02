import { test, expect } from '@playwright/test';
import { qaEnv } from '../helpers/env';

test.describe('Sign in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid-user@example.com');
    await page.getByLabel(/^password$/i).fill('wrong-password-123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/email or password|doesn't look right/i);
  });

  test('valid owner credentials redirect after sign in', async ({ page }) => {
    const { ownerEmail, ownerPassword } = qaEnv();
    if (!ownerEmail || !ownerPassword) {
      test.skip(true, 'Set QA_OWNER_EMAIL and QA_OWNER_PASSWORD in e2e/.env');
    }

    await page.getByLabel(/email/i).fill(ownerEmail);
    await page.getByLabel(/^password$/i).fill(ownerPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).not.toHaveURL(/\/auth$/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
