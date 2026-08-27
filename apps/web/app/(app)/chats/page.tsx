'use client';

import { ChatList } from '@/components/chat/chat-list';
import { NewChatDialog } from '@/components/chat/new-chat-dialog';

export default function ChatsPage() {
  return (
    <div className="mx-auto flex w-full min-h-0 max-w-2xl flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">گفت‌وگوها</h1>
        <NewChatDialog />
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
        <ChatList />
      </div>
    </div>
  );
}
