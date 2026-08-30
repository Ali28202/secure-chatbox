import { Prisma, prisma } from '@repo/database';

export type ChatWatermarks = ReadonlyMap<string, Date>;

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
    data: { status: 'READ', timestamp: new Date() },
  });

  return count;
}
