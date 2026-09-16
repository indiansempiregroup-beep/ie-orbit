import { expect, type Locator, type Page } from '@playwright/test';

/** Shared checks from docs/qa/CHECKLIST.md for forms we automate. */
export async function expectRequiredFieldError(page: Page, message: string | RegExp) {
  await expect(page.getByText(message).first()).toBeVisible();
}

export async function expectInvalidEmailCopy(scope: Page | Locator, typedValue: string) {
  const escapedValue = typedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(scope.getByText(new RegExp(`Invalid email address:\\s*${escapedValue}`, 'i'))).toBeVisible();
}
