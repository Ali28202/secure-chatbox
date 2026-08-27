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

/**
 * End-to-end tests: a real Chromium against the real Next server, the real
 * Hono API and a real Postgres.
 *
 * The only suite in the repository. There is no unit layer, because the
 * questions worth asking here are not ones a function called in isolation can
 * answer — whether the conversation actually reads right-to-left, whether a
 * message written in one browser appears in another, whether an upload survives
 * the round trip to the bucket. Those need a browser, so everything lives here.
 *
 * Run with `bun run test:e2e`. Postgres must be up (`bun run db:up`); everything
 * else — the database, the migrations, both servers — the suite starts itself.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  globalSetup: './e2e/support/global-setup.ts',

  /**
   * Safe because tests share no data: every test creates its own accounts with
   * unique university IDs, and nothing is truncated once the run has started.
   */
  fullyParallel: true,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [['list'], ['html', { outputFolder: join(ARTIFACT_DIR, 'report'), open: 'never' }]],
  outputDir: join(ARTIFACT_DIR, 'test-results'),

  /**
   * Roomy on purpose. `next dev` compiles a route the first time it is asked
   * for, so the first navigation of a run pays for a Turbopack build that later
   * ones do not — a timeout tuned to the warm case would fail the first test of
   * every run and pass on retry, which is the least useful kind of red.
   */
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: WEB_URL,

    // The audience is a Persian university. Formatting in the app pins `fa`
    // explicitly, so this is not what makes the digits Persian — it is here so
    // that anything relying on the browser's own locale is exercised the way a
    // real user would exercise it.
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
      /**
       * Started *without* `--env-file=../../.env`, unlike the `dev` script.
       *
       * Bun's `--env-file` would load the development `DATABASE_URL`,
       * `API_PORT` and `S3_*` values over the top of the block below, and the
       * suite would quietly run against the database — and the bucket — you are
       * developing with. Everything the API needs is passed explicitly instead.
       */
      command: 'bun run src/index.ts',
      cwd: join(ROOT_DIR, 'apps/api'),
      env: apiServerEnv(),

      // `/api/health` touches no database. Playwright starts web servers before
      // `globalSetup`, so at this moment the test database may not exist yet —
      // a probe that queried Postgres would fail on a fresh checkout every
      // time. Prisma connects lazily, so nothing is lost by waiting.
      url: API_HEALTH_URL,

      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // The binary directly rather than `bun run dev`, so the port is passed
      // without argument-forwarding ambiguity. It has a Node shebang, which is
      // what actually runs Next — the same as in development.
      command: `./node_modules/.bin/next dev --port ${WEB_PORT}`,
      cwd: join(ROOT_DIR, 'apps/web'),

      // `NEXT_PUBLIC_*` is inlined where it is read, so pointing the browser at
      // the suite's API is a matter of having this set when the route compiles.
      env: { NEXT_PUBLIC_API_URL: API_URL },

      url: WEB_URL,
      reuseExistingServer: !process.env.CI,

      // A cold Turbopack start, on a laptop, with nothing cached.
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
