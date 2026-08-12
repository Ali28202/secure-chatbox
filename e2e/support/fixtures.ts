import type { GlobalRole } from '@repo/shared';
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { Api } from './api';
import { createAccount, type Account } from './db';
import { WEB_URL } from './env';

/**
 * One signed-in person: who they are, the browser they are sitting at, and a
 * REST client that shares its cookies.
 */
export interface Session {
  account: Account;
  context: BrowserContext;
  page: Page;
  api: Api;
}

export type SessionFactory = (
  role: GlobalRole,
  overrides?: { name?: string; universityId?: string }
) => Promise<Session>;

interface Fixtures {
  /** Creates a brand-new account and a browser already signed in as them. */
  newSession: SessionFactory;
  student: Session;
  professor: Session;
  /** Uncaught exceptions from every page the test opened. Asserted empty. */
  pageErrors: Error[];
}

/**
 * The suite's `test`.
 *
 * Two decisions worth knowing about:
 *
 * **Every test gets its own people.** Accounts are created per test with unique
 * identifiers rather than shared from a seed, so `fullyParallel` is safe and no
 * test has to clean up after itself. The database is truncated once, in the
 * global setup, and never again — a truncation between tests would be a race
 * against every other worker.
 *
 * **Signing in happens over HTTP, not through the form.** `context.request`
 * shares its cookie jar with the browser context, so a `POST /api/auth/login`
 * on it leaves the pages in that context signed in. Driving the login form
 * instead would add a page load and a compile to every test, and would make the
 * login form a dependency of tests that are not about it — when it broke, all
 * of them would fail and none of them would say why. `auth.spec.ts` is where
 * the form itself is exercised.
 */
export const test = base.extend<Fixtures>({
  /**
   * Every test fails on an uncaught exception in the browser, whether or not it
   * was looking for one.
   *
   * This is not defensive padding. React recovers from an error thrown during
   * render by remounting, so a component that throws on every logout still
   * navigates, still ends up on the right page, and still passes an assertion
   * about where it landed — the failure appears only as a stack in the dev
   * server's output, which no one reads during a green run. That is exactly
   * what happened to `useCurrentUser`. Collecting `pageerror` turns "React
   * papered over it" back into a red test.
   */
  pageErrors: [
    // Playwright reads a fixture's dependencies off the source of its first
    // parameter, so the destructuring pattern has to be there even when the
    // fixture depends on nothing. `async (_, use)` throws at run time.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const errors: Error[] = [];
      await use(errors);

      // Teardown, so this runs after the test body and after every page it
      // opened has been closed — an error thrown during the last navigation
      // still counts.
      expect(errors.map((error) => error.message)).toEqual([]);
    },
    { auto: true },
  ],

  page: async ({ page, pageErrors }, use) => {
    page.on('pageerror', (error) => pageErrors.push(error));
    await use(page);
  },

  newSession: async ({ browser, pageErrors }, use) => {
    const opened: BrowserContext[] = [];

    await use(async (role, overrides) => {
      const account = await createAccount(role, overrides);

      // `browser.newContext` rather than the built-in `context` fixture,
      // because a test needs two of these at once — two people in one
      // conversation is most of what this application does. The cost is that
      // options from `use` are not applied automatically, hence `baseURL`.
      const context = await browser.newContext({ baseURL: WEB_URL });
      opened.push(context);

      const api = new Api(context.request);
      await api.login(account);

      const page = await context.newPage();
      page.on('pageerror', (error) => pageErrors.push(error));

      return { account, context, page, api };
    });

    for (const context of opened) {
      await context.close();
    }
  },

  student: async ({ newSession }, use) => {
    await use(await newSession('STUDENT'));
  },

  professor: async ({ newSession }, use) => {
    await use(await newSession('PROFESSOR'));
  },
});

export { expect } from '@playwright/test';
export type { Account };
