import type { ChatMemberRow, UserRow } from './lib/mappers';

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

/**
 * The environment for routes scoped to a single chat.
 *
 * `requireChatMember` has already resolved `:chatId` into a membership by the
 * time any of them run, so `c.get('membership')` is both the proof the caller
 * belongs there and the source of their `ChatRole` inside it.
 */
export interface ChatEnv extends AppEnv {
  Variables: AppEnv['Variables'] & {
    membership: ChatMemberRow;
    /**
     * The resolved `:chatId`.
     *
     * Carried on the context rather than re-read per handler because a sub-app
     * mounted at `/:chatId` cannot see that segment in its own route types —
     * `c.req.param('chatId')` there is `string | undefined`, and every handler
     * would have to re-narrow a value the middleware has already proven.
     */
    chatId: string;
  };
}
