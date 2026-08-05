'use client';

import { ChatList } from '@/components/chat/chat-list';
import { NewChatDialog } from '@/components/chat/new-chat-dialog';

/**
 * The list is capped narrower than the shell around it: a chat row is a title,
 * a one-line preview and a timestamp pinned to the far edge, and stretched to
 * the full width of the page those three end up with a void between them. The
 * cap keeps the row reading as one object.
 */
export default function ChatsPage() {
  return (
    <div className="mx-auto flex w-full min-h-0 max-w-2xl flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">گفت‌وگوها</h1>
        <NewChatDialog />
      </div>

      {/* The shell is a fixed screen height now, so a list longer than it has
          to scroll here — nothing outside this box scrolls at all. */}
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
        <ChatList />
      </div>
    </div>
  );
}
