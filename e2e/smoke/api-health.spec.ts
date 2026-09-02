import { test, expect } from '@playwright/test';
import { qaEnv } from '../helpers/env';

test.describe('API health', () => {
  test('health endpoint responds', async ({ request }) => {
    const { apiUrl } = qaEnv();
    const response = await request.get(`${apiUrl}/health/`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });
});
