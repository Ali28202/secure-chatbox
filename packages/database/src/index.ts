// The single entrypoint for database access. Nothing outside this package
// should reach into ../generated/prisma directly — keeping the generated client
// behind this barrel is what lets the output path or adapter change without a
// cross-repo refactor.

export { prisma } from './client.ts';

export { ChatRole, ChatType, GlobalRole, ReceiptStatus } from '../generated/prisma/enums.ts';

// The bare model aliases (User, Chat, …) live on client.ts. The models.ts barrel
// exports the suffixed forms (UserModel, ChatModel, …) plus every generated
// input/output type, which is not what callers want.
export type {
  Attachment,
  Chat,
  ChatMember,
  Message,
  MessageReceipt,
  User,
} from '../generated/prisma/client.ts';

export { Prisma, PrismaClient } from '../generated/prisma/client.ts';
