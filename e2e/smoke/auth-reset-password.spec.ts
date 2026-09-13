import { test, expect } from '@playwright/test';

test.describe('Reset password (legacy URL)', () => {
  test('shows OTP sign-in guidance', async ({ page }) => {
    await page.goto('/auth/reset-password?token=legacy-token');
    await expect(page.getByRole('heading', { name: /sign in with email code/i })).toBeVisible();
    await expect(page.getByText(/sign in with otp/i)).toBeVisible();
  });

  test('Back to sign in link works', async ({ page }) => {
    await page.goto('/auth/reset-password');
    await page.getByRole('link', { name: /back to sign in/i }).click();
    await expect(page).toHaveURL(/\/auth$/);
  });
});
