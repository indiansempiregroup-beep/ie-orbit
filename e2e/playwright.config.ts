import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const baseURL = process.env.QA_BASE_URL ?? 'https://ie-orbit.com';
const opsURL = process.env.QA_OPS_URL ?? 'https://ops.ie-orbit.com';

export default defineConfig({
  testDir: '.',
  testMatch: ['smoke/**/*.spec.ts', 'ops/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  outputDir: '../test-results',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'web',
      testMatch: ['smoke/**/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL,
      },
    },
    {
      name: 'ops',
      testMatch: ['ops/**/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: opsURL,
      },
    },
  ],
});
