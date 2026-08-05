import { ChatDetail } from '@/components/chat/chat-detail';

/**
 * `params` is a Promise in Next 16 and must be awaited — the segment is not
 * known until the request is being handled, so it cannot be a plain object.
 *
 * `PageProps<'/chats/[chatId]'>` is generated from the route literal by a dev
 * or build run, which is what types `chatId` here without a hand-written
 * interface.
 */
export default async function ChatPage({ params }: PageProps<'/chats/[chatId]'>) {
  const { chatId } = await params;

  return <ChatDetail chatId={chatId} />;
}
