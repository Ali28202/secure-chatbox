import type {
  ChatRole as PrismaChatRole,
  ChatType as PrismaChatType,
  GlobalRole as PrismaGlobalRole,
  ReceiptStatus as PrismaReceiptStatus,
} from '@repo/database';
import type {
  ChatRole as SharedChatRole,
  ChatType as SharedChatType,
  GlobalRole as SharedGlobalRole,
  ReceiptStatus as SharedReceiptStatus,
} from '@repo/shared';

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Assert<T extends true> = T;

export type GlobalRoleParity = Assert<Exact<PrismaGlobalRole, SharedGlobalRole>>;
export type ChatTypeParity = Assert<Exact<PrismaChatType, SharedChatType>>;
export type ChatRoleParity = Assert<Exact<PrismaChatRole, SharedChatRole>>;
export type ReceiptStatusParity = Assert<Exact<PrismaReceiptStatus, SharedReceiptStatus>>;
