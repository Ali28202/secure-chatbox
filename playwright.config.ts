import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  API_HEALTH_URL,
  API_URL,
  ARTIFACT_DIR,
  ROOT_DIR,
  WEB_PORT,
  WEB_URL,
  apiServerEnv,
} from './e2e/support/env';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  globalSetup: './e2e/support/global-setup.ts',

  fullyParallel: true,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [['list'], ['html', { outputFolder: join(ARTIFACT_DIR, 'report'), open: 'never' }]],
  outputDir: join(ARTIFACT_DIR, 'test-results'),

  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: WEB_URL,

    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',

    actionTimeout: 15_000,
    navigationTimeout: 60_000,

    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'bun run src/index.ts',
      cwd: join(ROOT_DIR, 'apps/api'),
      env: apiServerEnv(),

      url: API_HEALTH_URL,

      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `./node_modules/.bin/next dev --port ${WEB_PORT}`,
      cwd: join(ROOT_DIR, 'apps/web'),

      env: { NEXT_PUBLIC_API_URL: API_URL },

      url: WEB_URL,
      reuseExistingServer: !process.env.CI,

      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
