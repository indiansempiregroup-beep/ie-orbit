import { test, expect } from '@playwright/test';
import { qaEnv } from '../helpers/env';

test.describe('Ops workspace sign in', () => {
  test('owner can sign in and reach dashboard', async ({ page }) => {
    const { ownerEmail, ownerPassword } = qaEnv();
    if (!ownerEmail || !ownerPassword) {
      test.skip(true, 'Set QA_OWNER_EMAIL and QA_OWNER_PASSWORD in e2e/.env');
    }

    await page.goto('/');
    await page.getByPlaceholder(/you@|email/i).first().fill(ownerEmail);
    await page.getByPlaceholder(/password/i).first().fill(ownerPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/good (morning|afternoon|evening)|dashboard/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
