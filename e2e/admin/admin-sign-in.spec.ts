import { test, expect } from '@playwright/test';
import { fillOtpSignIn, requestOtpDebugCode } from '../helpers/auth';
import { qaEnv } from '../helpers/env';

test.describe('Platform admin sign in', () => {
  test('admin can sign in and reach the control plane', async ({ page, request }) => {
    const { platformAdminEmail } = qaEnv();
    if (!platformAdminEmail) {
      test.skip(true, 'Set QA_PLATFORM_ADMIN_EMAIL in e2e/.env');
    }

    const code = await requestOtpDebugCode(request, platformAdminEmail, 'ops');
    if (!code) {
      test.skip(true, 'OTP debug_code not returned (set AUTH_OTP_DEBUG_EMAILS on UAT)');
    }

    await page.goto('/auth');
    await fillOtpSignIn(page, platformAdminEmail, code!);
    await expect(page.getByText(/platform admin/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/admin/);
  });
});
