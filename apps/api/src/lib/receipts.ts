import { Prisma, prisma } from '@repo/database';

/**
 * Read state: who has seen what, and how much of it they have not.
 *
 * These queries live together because two modules ask the same question from
 * opposite ends — the chat list counts what a viewer has yet to read, the
 * message endpoints move that line forward — and the definition of "unread"
 * must be one definition. Split across the two services, it would drift the
 * first time either changed.
 *
 * The definition: a message is unread by someone iff they hold a receipt for it
 * that still says DELIVERED. Receipts exist only for the members present when a
 * message was sent, so a student added to a course group in اسفند never
 * inherits a badge for بهمن. The receipt rows *are* the scope — which is why
 * nothing below needs a `joinedAt` cutoff.
 */

/** For one chat: each member's read watermark, keyed by user id. */
export type ChatWatermarks = ReadonlyMap<string, Date>;

/**
 * Marks a new message undelivered-and-unread for everyone but its author.
 *
 * Takes the transaction client, not `prisma`, because it must commit with the
 * message. A message that lands without its receipts is a message no unread
 * count will ever include, and nothing downstream would ever notice: there is
 * no later pass that reconciles messages against receipts.
 *
 * The sender is excluded rather than immediately marked READ. Writing your own
 * message is not reading it, and a row for the author would need clearing on
 * every send just to keep the badge on your own conversations at zero.
 */
export async function createDeliveredReceipts(
  tx: Prisma.TransactionClient,
  { chatId, messageId, senderId }: { chatId: string; messageId: string; senderId: string }
): Promise<void> {
  const recipients = await tx.chatMember.findMany({
    where: { chatId, userId: { not: senderId } },
    select: { userId: true },
  });

  if (recipients.length === 0) return;

  await tx.messageReceipt.createMany({
    data: recipients.map(({ userId }) => ({ messageId, userId })),
  });
}

/**
 * How many messages each of `chatIds` holds that `userId` has not read.
 *
 * One query for the whole sidebar rather than one per chat — the `where` is a
 * single pass over `messages` joined to the `[userId, status]` index on
 * receipts.
 *
 * Deleted messages are excluded. Their receipts are still DELIVERED and still
 * advance normally, but a badge that draws someone into a conversation to find
 * «این پیام حذف شده است» is a badge that lied about there being something to
 * read.
 */
export async function countUnread(userId: string, chatIds: string[]): Promise<Map<string, number>> {
  if (chatIds.length === 0) return new Map();

  const rows = await prisma.message.groupBy({
    by: ['chatId'],
    where: {
      chatId: { in: chatIds },
      isDeleted: false,
      receipts: { some: { userId, status: 'DELIVERED' } },
    },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.chatId, row._count._all]));
}

/**
 * Every member's read watermark in each of `chatIds`.
 *
 * Raw SQL because the two grouping keys live in different tables: the receipt
 * supplies the user, the message supplies the chat and the timestamp. Prisma's
 * `groupBy` can only group by columns of the model being queried, and there is
 * no `chatId` on a receipt — so through the client this is one query per member
 * per chat, and a course group makes that thirty.
 */
export async function readWatermarks(chatIds: string[]): Promise<Map<string, ChatWatermarks>> {
  if (chatIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<{ chat_id: string; user_id: string; read_at: Date }[]>`
    SELECT m.chat_id, r.user_id, MAX(m.created_at) AS read_at
    FROM message_receipts r
    JOIN messages m ON m.id = r.message_id
    WHERE r.status = 'READ'
      AND m.chat_id IN (${Prisma.join(chatIds)})
    GROUP BY m.chat_id, r.user_id
  `;

  const byChat = new Map<string, Map<string, Date>>();

  for (const row of rows) {
    let watermarks = byChat.get(row.chat_id);
    if (!watermarks) byChat.set(row.chat_id, (watermarks = new Map()));
    watermarks.set(row.user_id, row.read_at);
  }

  return byChat;
}

/**
 * Advances `userId`'s receipts in `chat` up to and including `anchor`, and
 * answers how many actually moved.
 *
 * `status: 'DELIVERED'` in the filter is what makes the transition one-way: a
 * receipt that already says READ is not rewritten, so a client that reports an
 * older message after a newer one — two scroll settles racing, or a tab
 * restored from the back/forward cache — cannot walk anyone's watermark
 * backwards.
 *
 * The range is the same keyset the history cursor uses, for the same reason:
 * `createdAt` alone is not a total order, and a read line drawn on a
 * non-unique ordering leaves whichever of two same-millisecond messages sorted
 * second permanently unread.
 */
export async function advanceReceipts(
  userId: string,
  chatId: string,
  anchor: { id: string; createdAt: Date }
): Promise<number> {
  const { count } = await prisma.messageReceipt.updateMany({
    where: {
      userId,
      status: 'DELIVERED',
      message: {
        chatId,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lte: anchor.id } },
        ],
      },
    },
    // `timestamp` has no `@updatedAt`, so it is set by hand. The column records
    // when the receipt reached its current status, which for a READ row is now
    // and not when it was delivered.
    data: { status: 'READ', timestamp: new Date() },
  });

  return count;
}
