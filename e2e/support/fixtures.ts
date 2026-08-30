import type { GlobalRole } from '@repo/shared';
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { Api } from './api';
import { createAccount, type Account } from './db';
import { WEB_URL } from './env';

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
  newSession: SessionFactory;
  student: Session;
  professor: Session;
  pageErrors: Error[];
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const errors: Error[] = [];
      await use(errors);

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
