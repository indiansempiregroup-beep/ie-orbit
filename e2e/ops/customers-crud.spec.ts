import { test, expect } from '@playwright/test';
import { apiOpsSession, signInOpsWeb } from '../helpers/auth';
import { cleanupCustomersByPrefix, openCustomersAddForm } from '../helpers/customers';
import { isSafeMutationTarget, qaEnv } from '../helpers/env';
import { expectInvalidEmailCopy, expectRequiredFieldError } from '../helpers/forms';
import { e2eEmail, e2eMobile, e2eRunId } from '../helpers/unique';

test.describe.configure({ mode: 'serial' });

test.describe('Ops customers CRUD', () => {
  const runId = e2eRunId();
  const firstName = 'E2E';
  const lastName = runId;
  const editedLast = `${runId}-edit`;
  const email = e2eEmail(runId);
  const phone = e2eMobile(runId);

  test.afterAll(async ({ request }) => {
    await cleanupCustomersByPrefix(request, runId);
  });

  test('add validation, create, edit, and detail', async ({ page, request }) => {
    const { ownerEmail, opsUrl, apiUrl } = qaEnv();
    if (!isSafeMutationTarget(opsUrl, apiUrl)) {
      test.skip(true, 'Mutating customer CRUD is restricted to UAT or localhost');
    }
    if (!ownerEmail) {
      test.skip(true, 'Set QA_OWNER_EMAIL in e2e/.env');
    }
    if (!(await apiOpsSession(request, ownerEmail))) {
      test.skip(true, 'OTP debug_code not returned (set AUTH_OTP_DEBUG_EMAILS on UAT)');
    }

    const signedIn = await signInOpsWeb(page, ownerEmail);
    if (!signedIn) {
      test.skip(true, 'Could not sign in to ops web');
    }

    await openCustomersAddForm(page);

    await page.getByTestId('customer-form-submit').click();
    await expectRequiredFieldError(page, 'First name is required');
    await expectRequiredFieldError(page, 'Last name is required');
    await expect(page.getByText(/email or phone is required/i).first()).toBeVisible();

    await page.getByTestId('field-email').fill('not-an-email');
    await page.getByTestId('customer-form-submit').click();
    await expectInvalidEmailCopy(page, 'not-an-email');

    await page.getByTestId('field-first-name').fill(firstName);
    await page.getByTestId('field-last-name').fill(lastName);
    await page.getByTestId('field-email').fill(email);
    await page.getByTestId('field-phone').fill(phone);
    await page.getByTestId('customer-form-submit').click();

    await expect(page.getByText(new RegExp(`${firstName}\\s+${lastName}`)).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(email).first()).toBeVisible();

    await page.getByTestId('customer-edit').click();
    await expect(page.getByText(/edit customer/i).first()).toBeVisible();
    await page.getByTestId('field-last-name').fill(editedLast);
    await page.getByTestId('customer-form-submit').click();
    await expect(page.getByText(new RegExp(`${firstName}\\s+${editedLast}`)).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
