import { ChatDetail } from '@/components/chat/chat-detail';

export default async function ChatPage({ params }: PageProps<'/chats/[chatId]'>) {
  const { chatId } = await params;

  return <ChatDetail chatId={chatId} />;
}
