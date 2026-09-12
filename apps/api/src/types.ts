import type { ChatMemberRow, ChatRow, UserRow } from './lib/mappers';

export interface AppEnv {
  Variables: {
    user: UserRow;
    /** Which sign-in this request belongs to. Set by `requireAuth`. */
    sessionId: string;
  };
}

export interface ChatEnv extends AppEnv {
  Variables: AppEnv['Variables'] & {
    membership: ChatMemberRow;
    chat: ChatRow;
    chatId: string;
  };
}
