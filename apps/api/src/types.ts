import type { UserRow } from './lib/mappers';

/**
 * The Hono environment for this application.
 *
 * Every router that sits behind `requireAuth` is declared as `Hono<AppEnv>`,
 * which is what makes `c.get('user')` typed instead of `any` — and therefore
 * what makes a typo in a role check a compile error rather than a hole.
 *
 * Note the variable holds a `UserRow`, not a full Prisma `User`: `requireAuth`
 * selects only the safe columns, so `passwordHash` is not in scope anywhere
 * downstream of authentication.
 */
export interface AppEnv {
  Variables: {
    user: UserRow;
  };
}
