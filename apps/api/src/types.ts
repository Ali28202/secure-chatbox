import type { ChatMemberRow, ChatRow, UserRow } from './lib/mappers';

export interface AppEnv {
  Variables: {
    user: UserRow;
  };
}

export interface ChatEnv extends AppEnv {
  Variables: AppEnv['Variables'] & {
    membership: ChatMemberRow;
    chat: ChatRow;
    chatId: string;
  };
}
