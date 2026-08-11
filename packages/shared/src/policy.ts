import type { ChatRole, ChatType, GlobalRole } from './constants';

/**
 * Every access rule in the platform, written once as a pure function.
 *
 * The rules were previously spelled out where they were enforced: the send
 * check inside `MessageService`, the delete check beside it, the course-group
 * check in a route handler, and — the one that actually hurt — a copy of the
 * send rules in the web composer so a muted member is told *before* they type a
 * message and lose it to a refusal. Two copies of a rule is one rule and one
 * bug waiting for someone to edit only the near one.
 *
 * So both sides read from here instead. Nothing in this file touches Prisma,
 * Hono, React or the network; every function takes plain data and returns a
 * boolean, which is what lets the API import it into a service and the browser
 * import it into a hook.
 *
 * **The API is still the only thing that decides.** A predicate evaluated in the
 * browser decides what to *draw* — a button that is not there is a kindness, not
 * a defence, and anyone can call the endpoint directly. Every rule below is
 * evaluated again on the server against rows it loaded itself.
 *
 * The parameter types are deliberately structural and minimal: they name the
 * fields a rule reads and nothing else, so both `ChatMemberRow` (the API's
 * Prisma row) and `ChatMemberDto` (the browser's JSON) satisfy them as they are,
 * with no adapter in between.
 */

/** The signed-in user — their platform-wide role, not their role in any chat. */
export interface PolicyUser {
  id: string;
  role: GlobalRole;
}

/** A chat, reduced to the fields any rule here actually reads. */
export interface PolicyChat {
  type: ChatType;
  isReadOnly: boolean;
  creatorId: string;
}

/**
 * One person's membership of one chat.
 *
 * `ChatRole` and `GlobalRole` are separate on purpose and are never compared:
 * being a PROFESSOR in the university does not make you an admin of a group you
 * were added to, and being the admin of a study group does not make a student a
 * professor. The only thing the global role decides is what someone may
 * *create*; everything inside a chat is decided by `ChatRole`.
 */
export interface PolicyMember {
  user: { id: string };
  role: ChatRole;
  isMuted: boolean;
}

// ---------------------------------------------------------------------------
// Creating chats — the one place the global role matters
// ---------------------------------------------------------------------------

/**
 * Whether this account teaches, for the purposes below.
 *
 * `ADMIN` is included because a platform administrator who could not create a
 * course group would have to make themselves a professor to fix one, and a role
 * you have to escalate out of is not a role.
 */
export function isFaculty(user: PolicyUser): boolean {
  return user.role === 'PROFESSOR' || user.role === 'ADMIN';
}

/**
 * A course group is a teaching artifact: the use-case diagram gives it to
 * professors, and whoever creates one also administers it and adds people to
 * it. Direct chats and custom groups stay open to everyone — a student
 * organising a study group is the platform working as intended.
 */
export function canCreateChat(user: PolicyUser, type: ChatType): boolean {
  return type === 'COURSE_GROUP' ? isFaculty(user) : true;
}

// ---------------------------------------------------------------------------
// Writing in a chat
// ---------------------------------------------------------------------------

/** Why a member of a chat can still be unable to write in it. */
export type SendBlock = 'MUTED' | 'READ_ONLY';

/**
 * The sentence the person is shown, in both places they can meet the rule: the
 * API's 403 body, and the disabled composer that stops them reaching it.
 *
 * They are the same string because they describe the same situation, and a
 * client that phrased it differently from the server would be a second
 * explanation to keep in step with the first.
 */
export const SEND_BLOCK_MESSAGES: Record<SendBlock, string> = {
  MUTED: 'شما در این گفت‌وگو بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.',
  READ_ONLY: 'این گفت‌وگو فقط‌خواندنی است.',
};

/**
 * What stops this member writing here, or null if nothing does.
 *
 * Returns the reason rather than a boolean because the caller always needs it:
 * the API puts it in the error body, the composer puts it under the disabled
 * box. `canSendMessage` is the boolean, for callers that only ask yes or no.
 *
 * Muting is checked first, and the order is the rule: a muted admin is muted.
 * Reading it the other way round would make `isMuted` unenforceable against
 * exactly the people it most needs to be enforceable against.
 */
export function sendBlock(chat: PolicyChat, member: PolicyMember): SendBlock | null {
  if (member.isMuted) return 'MUTED';

  // A read-only chat is an announcement channel: the admins speak, everyone
  // else reads. Reading is never restricted — see `markAsRead`, which is
  // deliberately not gated on this.
  if (chat.isReadOnly && member.role !== 'ADMIN') return 'READ_ONLY';

  return null;
}

export function canSendMessage(chat: PolicyChat, member: PolicyMember): boolean {
  return sendBlock(chat, member) === null;
}

// ---------------------------------------------------------------------------
// Acting on a message
// ---------------------------------------------------------------------------

/**
 * Your own message is always yours to withdraw. Anyone else's is a moderation
 * action, which in a course group belongs to the professor — the person holding
 * `ChatRole.ADMIN` there.
 *
 * Takes the sender's id rather than a message, because the two sides hold that
 * id in different shapes (`senderId` on the row, `sender.id` on the DTO) and a
 * parameter type covering both would be wider than the rule.
 */
export function canDeleteMessage(member: PolicyMember, senderId: string): boolean {
  return member.user.id === senderId || member.role === 'ADMIN';
}

/**
 * Pinning is purely a moderation action — it changes what the whole chat sees
 * at the top of the conversation — so unlike deletion there is no "your own
 * message" case. A student cannot pin their own question in a course group.
 */
export function canPinMessage(member: PolicyMember): boolean {
  return member.role === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Administering a chat
// ---------------------------------------------------------------------------

/**
 * Direct chats are excluded from every rule below. Both participants are ADMIN
 * — there is no hierarchy in a conversation between two people — so a rule that
 * only asked about `ChatRole` would let either of them mute the other or turn
 * the conversation read-only, which is not administration but a weapon.
 */
export function canUpdateChat(chat: PolicyChat, member: PolicyMember): boolean {
  return chat.type !== 'DIRECT' && member.role === 'ADMIN';
}

/** Adding someone, removing someone else, or changing what they may do. */
export function canManageMembers(chat: PolicyChat, member: PolicyMember): boolean {
  return chat.type !== 'DIRECT' && member.role === 'ADMIN';
}

/**
 * Changing another member's role or mute state.
 *
 * Never yourself, and that exclusion is load-bearing rather than tidy: an admin
 * who could demote themselves could leave a group with no admin at all, which
 * nothing inside the app could then repair. Handing the role to someone else
 * first and leaving afterwards is the path, and it is the one `canLeaveChat`
 * checks for.
 */
export function canUpdateMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  return canManageMembers(chat, actor) && actor.user.id !== target.user.id;
}

/**
 * Muting, which is `canUpdateMember` plus one restriction: an admin is never
 * muted.
 *
 * `sendBlock` reads `isMuted` before it reads `isReadOnly`, so a muted admin
 * loses the one capability the role exists for — and in a read-only chat that
 * would silence the only people who can speak in it. Co-admins can remove each
 * other; they cannot gag each other.
 */
export function canMuteMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  return canUpdateMember(chat, actor, target) && target.role !== 'ADMIN';
}

/**
 * Walking out of a conversation.
 *
 * Nobody needs permission to leave, with one exception: the last admin. A group
 * whose only admin leaves has nobody who can add members, pin, or hand the role
 * on, and no way to acquire one — the fix would have to come from outside the
 * application. So the last admin is asked to appoint a successor first, which
 * is what `canUpdateMember` makes possible.
 *
 * `otherAdminCount` is a parameter rather than something derived here because
 * this file cannot count rows: the API passes a `COUNT`, the browser counts the
 * member list it already has.
 */
export function canLeaveChat(
  chat: PolicyChat,
  member: PolicyMember,
  otherAdminCount: number
): boolean {
  // A direct chat is left by deleting it, not by halving it — a one-person
  // "conversation" is a row nothing in the UI knows how to draw.
  if (chat.type === 'DIRECT') return false;

  return member.role !== 'ADMIN' || otherAdminCount > 0;
}
