import { test, expect } from '@playwright/test';

test.describe('Forgot password (legacy URL)', () => {
  test('redirects visitors to OTP sign-in guidance', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.getByRole('heading', { name: /sign in with email code/i })).toBeVisible();
    await expect(page.getByText(/sign in with otp/i)).toBeVisible();
  });

  test('Back to sign in link works', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.getByRole('link', { name: /back to sign in/i }).click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });
});
