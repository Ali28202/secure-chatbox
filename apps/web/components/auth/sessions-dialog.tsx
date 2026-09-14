'use client';

import { formatMessageTime, toPersianDigits } from '@repo/shared';
import { Loader2Icon, MonitorSmartphoneIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '@/hooks/use-sessions';
import { getApiErrorMessage } from '@/lib/api';

/** A user agent is unreadable; this turns it into something a person recognises. */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'یه دستگاه ناشناس';

  const browser = /Firefox\/|FxiOS/.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\/|CriOS/.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'مرورگر';

  const platform = /Android/.test(userAgent)
    ? 'اندروید'
    : /iPhone|iPad|iOS/.test(userAgent)
      ? 'iOS'
      : /Windows/.test(userAgent)
        ? 'ویندوز'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'مک'
          : /Linux/.test(userAgent)
            ? 'لینوکس'
            : 'نامشخص';

  return `${browser} روی ${platform}`;
}

export function SessionsDialog() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const others = sessions.data?.filter((session) => !session.isCurrent) ?? [];

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" className="h-9 w-full justify-start gap-2" />}>
        <MonitorSmartphoneIcon />
        دستگاه‌هایی که وارد شدن
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>دستگاه‌هایی که وارد شدن</DialogTitle>
          <DialogDescription>
            هر جایی که با حسابت وارد شدی اینجاست. اگه یکیشون رو نمی‌شناسی، همین‌جا بیرونش کن — همون
            لحظه قطع می‌شه.
          </DialogDescription>
        </DialogHeader>

        {sessions.isPending ? (
          <div className="flex justify-center py-8" aria-busy>
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            <span className="sr-only">داره میاد…</span>
          </div>
        ) : sessions.isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">لیست دستگاه‌ها لود نشد!</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {sessions.data.map((session) => (
              <li key={session.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                <MonitorSmartphoneIcon className="size-4 shrink-0 text-muted-foreground" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {describeAgent(session.userAgent)}
                    {session.isCurrent && (
                      <Badge variant="secondary" className="ms-2">
                        همینی که توشی
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    آخرین بار {formatMessageTime(session.lastUsedAt)}
                    {session.ipAddress && (
                      <>
                        {' · '}
                        <span dir="ltr">{session.ipAddress}</span>
                      </>
                    )}
                  </p>
                </div>

                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={revoke.isPending}
                    aria-label={`بیرون کردن ${describeAgent(session.userAgent)}`}
                    onClick={() =>
                      revoke.mutate(session.id, {
                        onError: (error) => toast.error(getApiErrorMessage(error)),
                        onSuccess: () => toast.success('اون دستگاه بیرون رفت.'),
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {others.length > 0 && (
          <Button
            variant="destructive"
            disabled={revokeOthers.isPending}
            onClick={() =>
              revokeOthers.mutate(undefined, {
                onError: (error) => toast.error(getApiErrorMessage(error)),
                onSuccess: ({ revoked }) =>
                  toast.success(`${toPersianDigits(revoked)} دستگاه بیرون رفت.`),
              })
            }
          >
            بقیه رو بیرون کن
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
