import { test, expect } from '@playwright/test';
import { requestOtpDebugCode, fillOtpSignIn } from '../helpers/auth';
import { qaEnv } from '../helpers/env';

test.describe('Ops workspace sign in', () => {
  test('owner can sign in and reach dashboard', async ({ page, request }) => {
    const { ownerEmail } = qaEnv();
    if (!ownerEmail) {
      test.skip(true, 'Set QA_OWNER_EMAIL in e2e/.env');
    }

    const code = await requestOtpDebugCode(request, ownerEmail, 'ops');
    if (!code) {
      test.skip(true, 'OTP debug_code not returned (set AUTH_OTP_DEBUG_EMAILS on UAT)');
    }

    await page.goto('/');
    await fillOtpSignIn(page, ownerEmail, code!);

    await expect(page.getByText(/good (morning|afternoon|evening)|dashboard/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
