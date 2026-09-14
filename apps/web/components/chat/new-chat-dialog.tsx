'use client';

import { createChatSchema, type CreateChatPayload, type UserSummaryDto } from '@repo/shared';
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
import { getApiErrorMessage } from '@/lib/api';
import { ROUTES } from '@/lib/routes';

export function NewChatDialog() {
  const router = useRouter();
  const createChat = useCreateChat();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<UserSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setMembers([]);
    setError(null);
    createChat.reset();
  }

  function submit(payload: CreateChatPayload) {
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
            یه نفر رو برای چت خصوصی انتخاب کن یا یه گروه جدید بساز
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
              <FieldLabel htmlFor="chat-title">اسم گروه</FieldLabel>
              <Input
                id="chat-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="مثلاً مهندسی نرم‌افزار — گروه ۱"
              />
            </Field>

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

            <Button
              type="button"
              disabled={createChat.isPending}
              onClick={() =>
                submit({ type: 'GROUP', title, memberIds: members.map((member) => member.id) })
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
