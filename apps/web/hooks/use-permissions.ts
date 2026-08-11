'use client';

import {
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

/**
 * What the signed-in user may do in one chat.
 *
 * Every answer comes from `@repo/shared/policy`, which is the same module the
 * API's guards call. That is the point of the file: a screen that offers an
 * action the server refuses is a bug the user finds, and a screen that hides an
 * action the server would allow is a feature nobody knows exists. Both are
 * drift, and both used to be possible because these rules were written twice.
 *
 * None of this is a security boundary. Everything here is decided again on the
 * API, against rows read fresh from the database rather than against whatever
 * this tab last cached. What it buys is an interface that tells the truth:
 * the composer greys out with the reason, the pin item is absent rather than
 * failing, «گروه درسی» is missing from a student's picker instead of being
 * offered and refused.
 */
export interface ChatPermissions {
  /** The viewer's own row in this chat, or undefined while it is loading. */
  membership: ChatMemberDto | undefined;
  isChatAdmin: boolean;
  canSend: boolean;
  /** Why the composer is disabled, in Persian, or null when it is not. */
  sendBlockedReason: string | null;
  canPin: boolean;
  canManageMembers: boolean;
  canUpdateChat: boolean;
  /** Whether the viewer may delete a message sent by `senderId`. */
  canDelete: (senderId: string) => boolean;
  /** Whether the viewer may change `member`'s role or mute state. */
  canUpdateMember: (member: ChatMemberDto) => boolean;
  /** Narrower than the above: an admin is never muted, not even by an admin. */
  canMuteMember: (member: ChatMemberDto) => boolean;
}

export function useChatPermissions(chat: ChatListItemDto | undefined): ChatPermissions {
  const viewer = useCurrentUser();

  return useMemo(() => {
    const membership = chat?.members.find((member) => member.user.id === viewer.id);

    // No chat, or a chat whose member list has not arrived: everything is
    // refused. Denying by default means a slow load renders a read-only screen
    // for a moment rather than one offering actions that are about to fail.
    if (!chat || !membership) {
      return {
        membership: undefined,
        isChatAdmin: false,
        canSend: false,
        sendBlockedReason: null,
        canPin: false,
        canManageMembers: false,
        canUpdateChat: false,
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
      // The same string the API would answer with, because both read it from
      // the same record — so being refused by the server tells the user
      // nothing the greyed-out box had not already said.
      sendBlockedReason: blocked ? SEND_BLOCK_MESSAGES[blocked] : null,
      canPin: canPinMessage(membership),
      canManageMembers: canManageMembers(chat, membership),
      canUpdateChat: canUpdateChat(chat, membership),
      canDelete: (senderId: string) => canDeleteMessage(membership, senderId),
      canUpdateMember: (member: ChatMemberDto) => canUpdateMember(chat, membership, member),
      canMuteMember: (member: ChatMemberDto) => canMuteMember(chat, membership, member),
    };
  }, [chat, viewer.id]);
}

/**
 * Which of `types` the signed-in user may create.
 *
 * Its own hook because it is asked before any chat exists — by the new-chat
 * form, which has no membership to hand. No `useMemo`: the caller passes an
 * array literal whose identity changes every render anyway, and filtering two
 * strings costs less than the comparison would.
 */
export function useCreatableChatTypes<T extends ChatType>(types: readonly T[]): T[] {
  const viewer = useCurrentUser();
  return types.filter((type) => canCreateChat(viewer, type));
}
