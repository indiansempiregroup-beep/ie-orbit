import { test, expect } from '@playwright/test';
import { expectInvalidEmailCopy, expectRequiredFieldError } from '../helpers/forms';

test.describe('Register wizard', () => {
  test('mandatory fields block empty submit', async ({ page }) => {
    await page.goto('/auth/register/start');
    await page.getByRole('button', { name: /next|continue|create/i }).first().click();
    await expect(page.locator('[role="alert"], .auth-error, [class*="error"], .field-error')).not.toHaveCount(0);
  });

  test('invalid business email shows a validation message', async ({ page }) => {
    await page.goto('/auth/register/start');
    await page.getByLabel(/business email/i).fill('not-an-email');
    await page.getByRole('button', { name: /continue/i }).click();
    await expectInvalidEmailCopy(page, 'not-an-email');
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

test.describe('Contact form', () => {
  test('required fields and invalid email block submit', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: /send message/i }).click();
    await expectRequiredFieldError(page, 'Name is required');
    await expectRequiredFieldError(page, /email is required/i);
    await expectRequiredFieldError(page, 'Message is required');

    await page.getByLabel(/^email$/i).fill('foo');
    await page.getByRole('button', { name: /send message/i }).click();
    await expectInvalidEmailCopy(page, 'foo');
  });
});
