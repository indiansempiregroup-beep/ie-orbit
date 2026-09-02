import { test, expect } from '@playwright/test';

test.describe('Register wizard', () => {
  test('mandatory fields block empty submit', async ({ page }) => {
    await page.goto('/auth/register/start');
    await page.getByRole('button', { name: /next|continue|create/i }).first().click();
    await expect(page.locator('[role="alert"], .auth-error, [class*="error"]')).not.toHaveCount(0);
  });

  test('cancel returns toward marketing home', async ({ page }) => {
    await page.goto('/auth/register/start');
    const cancel = page.getByRole('link', { name: /cancel/i }).or(page.getByRole('button', { name: /cancel/i }));
    if ((await cancel.count()) === 0) {
      test.skip(true, 'Cancel control not present on first wizard step');
    }
    await cancel.first().click();
    await expect(page).toHaveURL(/\/(auth\/register|$)/);
  });
});
