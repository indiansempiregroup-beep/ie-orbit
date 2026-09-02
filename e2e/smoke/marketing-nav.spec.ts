import { test, expect } from '@playwright/test';

/** Maps docs/qa/scenarios/test-scenarios.md — Home Page nav links */
const mainNavLinks = [
  { label: 'Home', path: '/', heading: /IE Orbit|appointments and retail/i },
  { label: 'Features', path: '/features', heading: /features/i },
  { label: 'Pricing', path: '/pricing', heading: /pricing/i },
  { label: 'About', path: '/about', heading: /about/i },
  { label: 'Contact', path: '/contact', heading: /contact/i },
  { label: 'FAQ', path: '/faq', heading: /faq|questions/i },
];

test.describe('Marketing navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  for (const link of mainNavLinks) {
    test(`main nav "${link.label}" navigates to ${link.path}`, async ({ page }) => {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: link.label }).click();
      await expect(page).toHaveURL(new RegExp(`${link.path.replace('/', '\\/')}$`));
      await expect(page.locator('main')).toBeVisible();
    });
  }

  test('Sign in link opens auth page', async ({ page }) => {
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('Create account link opens registration', async ({ page }) => {
    await page.getByRole('link', { name: 'Create account' }).first().click();
    await expect(page).toHaveURL(/\/auth\/register/);
  });

  test('footer Product links are reachable', async ({ page }) => {
    const footer = page.locator('footer');
    for (const label of ['Features', 'Pricing', 'FAQ', 'Help Center']) {
      await footer.getByRole('link', { name: label }).click();
      await expect(page.locator('main')).toBeVisible();
      await page.goto('/');
    }
  });

  test('footer Legal links are reachable', async ({ page }) => {
    const footer = page.locator('footer');
    for (const label of ['Privacy', 'Terms']) {
      await footer.getByRole('link', { name: label }).click();
      await expect(page.locator('main')).toBeVisible();
      await page.goto('/');
    }
  });
});
