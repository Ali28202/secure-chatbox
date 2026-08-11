'use client';

import {
  createChatSchema,
  type ChatType,
  type CreateChatPayload,
  type UserSummaryDto,
} from '@repo/shared';
import { Loader2Icon, PlusIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserPicker } from '@/components/chat/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateChat } from '@/hooks/use-chats';
import { useCreatableChatTypes } from '@/hooks/use-permissions';
import { getApiErrorMessage } from '@/lib/api';
import { ROUTES } from '@/lib/routes';

/**
 * Ordered most-privileged first, which is what makes the default below the
 * best type the user is allowed rather than a hardcoded one per role.
 */
const GROUP_TYPES = ['COURSE_GROUP', 'CUSTOM_GROUP'] as const;

/**
 * Starting a conversation: pick one person for a direct chat, or name a group
 * and gather its members.
 *
 * The direct tab creates on the first click — there is nothing else to decide,
 * and the API returns the existing chat when the pair already have one, so a
 * second attempt lands the user back in the same thread rather than a duplicate.
 */
export function NewChatDialog() {
  const router = useRouter();
  const createChat = useCreateChat();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<UserSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  /*
   * Which kinds of group this user may start, straight from `policy.ts` — the
   * same predicate the API applies to the request. A student is offered only
   * «گروه عادی» because that is genuinely all they can create, not because
   * this screen has its own opinion about students.
   */
  const groupTypes = useCreatableChatTypes(GROUP_TYPES);
  // The first they are allowed: a course group for a professor, a plain one for
  // a student, and neither case stated here. `CUSTOM_GROUP` is the fallback
  // only because a `[0]` on an array TypeScript cannot prove is non-empty needs
  // one — the policy allows it to everybody.
  const [groupType, setGroupType] = useState<Exclude<ChatType, 'DIRECT'>>(
    groupTypes[0] ?? 'CUSTOM_GROUP'
  );

  function reset() {
    setTitle('');
    setMembers([]);
    setError(null);
    createChat.reset();
  }

  function submit(payload: CreateChatPayload) {
    // The same schema the API parses, so a title that is too short is caught
    // here with the identical Persian message rather than after a round trip.
    const parsed = createChatSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? null);
      return;
    }

    setError(null);
    createChat.mutate(payload, {
      onSuccess: (chat) => {
        setOpen(false);
        reset();
        router.push(ROUTES.chat(chat.id));
      },
      onError: (cause) => setError(getApiErrorMessage(cause)),
    });
  }

  function toggleMember(candidate: UserSummaryDto) {
    setMembers((current) =>
      current.some((member) => member.id === candidate.id)
        ? current.filter((member) => member.id !== candidate.id)
        : [...current, candidate]
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        گفت‌وگوی جدید
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>گفت‌وگوی جدید</DialogTitle>
          <DialogDescription>
            یک نفر را برای گفت‌وگوی خصوصی انتخاب کنید یا گروهی تازه بسازید.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="direct">
          <TabsList className="w-full">
            <TabsTrigger value="direct">گفت‌وگوی خصوصی</TabsTrigger>
            <TabsTrigger value="group">گروه</TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="pt-3">
            <UserPicker
              selected={[]}
              onSelect={(peer) => submit({ type: 'DIRECT', memberId: peer.id })}
            />
          </TabsContent>

          <TabsContent value="group" className="flex flex-col gap-3 pt-3">
            <Field>
              <FieldLabel htmlFor="chat-title">نام گروه</FieldLabel>
              <Input
                id="chat-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="مثلاً مهندسی نرم‌افزار — گروه ۱"
              />
            </Field>

            {/* Hidden when there is nothing to choose between — a student sees
                the one kind they can make rather than a row of one button. */}
            {groupTypes.length > 1 && (
              <div className="flex gap-2" role="group" aria-label="نوع گروه">
                {groupTypes.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={groupType === type ? 'default' : 'outline'}
                    aria-pressed={groupType === type}
                    onClick={() => setGroupType(type)}
                  >
                    {type === 'COURSE_GROUP' ? 'گروه درسی' : 'گروه عادی'}
                  </Button>
                ))}
              </div>
            )}

            {members.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {members.map((member) => (
                  <li key={member.id}>
                    <Badge variant="secondary" className="gap-1 pe-1">
                      {member.name}
                      <button
                        type="button"
                        onClick={() => toggleMember(member)}
                        aria-label={`حذف ${member.name}`}
                        className="rounded-full p-0.5 hover:bg-foreground/10"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <UserPicker
              selected={members.map((member) => member.id)}
              onSelect={toggleMember}
              multiple
            />

            {/*
             * The submit button belongs to this tab rather than the dialog
             * footer: the direct tab creates on click and has nothing to
             * confirm, so a shared footer button would sit there doing nothing
             * on half the dialog.
             */}
            <Button
              type="button"
              disabled={createChat.isPending}
              onClick={() =>
                submit({ type: groupType, title, memberIds: members.map((member) => member.id) })
              }
            >
              {createChat.isPending && <Loader2Icon className="animate-spin" />}
              ساخت گروه
            </Button>
          </TabsContent>
        </Tabs>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
