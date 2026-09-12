'use client';

import {
  canArchiveChat,
  canCreateChat,
  canDeleteMessage,
  canManageMembers,
  canMuteMember,
  canPinMessage,
  canUpdateChat,
  canUpdateMember,
  sendBlock,
  SEND_BLOCK_MESSAGES,
  type ChatListItemDto,
  type ChatMemberDto,
  type ChatType,
} from '@repo/shared';
import { useMemo } from 'react';
import { useCurrentUser } from '@/hooks/use-auth';

export interface ChatPermissions {
  membership: ChatMemberDto | undefined;
  isChatAdmin: boolean;
  canSend: boolean;
  sendBlockedReason: string | null;
  canPin: boolean;
  canManageMembers: boolean;
  canUpdateChat: boolean;
  canArchiveChat: boolean;
  canDelete: (senderId: string) => boolean;
  canUpdateMember: (member: ChatMemberDto) => boolean;
  canMuteMember: (member: ChatMemberDto) => boolean;
}

export function useChatPermissions(chat: ChatListItemDto | undefined): ChatPermissions {
  const viewer = useCurrentUser();

  return useMemo(() => {
    const membership = chat?.members.find((member) => member.user.id === viewer.id);

    if (!chat || !membership) {
      return {
        membership: undefined,
        isChatAdmin: false,
        canSend: false,
        sendBlockedReason: null,
        canPin: false,
        canManageMembers: false,
        canUpdateChat: false,
        canArchiveChat: false,
        canDelete: () => false,
        canUpdateMember: () => false,
        canMuteMember: () => false,
      };
    }

    const blocked = sendBlock(chat, membership);

    return {
      membership,
      isChatAdmin: membership.role === 'ADMIN',
      canSend: blocked === null,
      sendBlockedReason: blocked ? SEND_BLOCK_MESSAGES[blocked] : null,
      canPin: canPinMessage(membership),
      canManageMembers: canManageMembers(chat, membership),
      canUpdateChat: canUpdateChat(chat, membership),
      canArchiveChat: canArchiveChat(chat, membership),
      canDelete: (senderId: string) => canDeleteMessage(membership, senderId),
      canUpdateMember: (member: ChatMemberDto) => canUpdateMember(chat, membership, member),
      canMuteMember: (member: ChatMemberDto) => canMuteMember(chat, membership, member),
    };
  }, [chat, viewer.id]);
}

export function useCreatableChatTypes<T extends ChatType>(types: readonly T[]): T[] {
  const viewer = useCurrentUser();
  return types.filter((type) => canCreateChat(viewer, type));
}
