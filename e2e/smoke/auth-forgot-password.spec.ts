import { test, expect } from '@playwright/test';

test.describe('Forgot password', () => {
  test('QA-008 invalid email is rejected by browser validation', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    const email = page.getByLabel(/email/i);
    await email.fill('not-an-email');
    await page.getByRole('button', { name: /send reset link/i }).click();
    const validationMessage = await email.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage.length).toBeGreaterThan(0);
  });

  test('valid email submits forgot-password form', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.getByLabel(/email/i).fill('qa-smoke@ie-orbit.com');
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByRole('status')).toContainText(/reset link/i);
  });

  test('Back to sign in link works', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.getByRole('link', { name: /back to sign in/i }).click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });
});
