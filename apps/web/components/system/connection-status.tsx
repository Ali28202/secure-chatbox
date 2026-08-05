'use client';

import { toPersianDigits } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheckIcon, Loader2Icon, OctagonXIcon, RefreshCwIcon } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DbHealth {
  db: 'ok';
  users: number;
}

/**
 * A live check that the browser can reach the API and the API can reach
 * Postgres.
 *
 * It exists because every layer this project has so far meets in this one
 * request: axios with credentials, CORS, the Hono app, the Prisma client and
 * the container. When something is misconfigured, this card says which side
 * broke — far quicker than reading three sets of logs.
 */
export function ConnectionStatus() {
  const health = useQuery({
    queryKey: ['health', 'db'],
    queryFn: async () => (await api.get<DbHealth>('/health/db')).data,
    // A status widget that lies for thirty seconds is not a status widget.
    staleTime: 0,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>وضعیت سامانه</CardTitle>
        <CardDescription>ارتباط مرورگر با سرویس و پایگاه داده</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void health.refetch()}
            disabled={health.isFetching}
            aria-label="بررسی دوباره"
          >
            <RefreshCwIcon className={health.isFetching ? 'animate-spin' : undefined} />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {health.isPending ? (
          <div className="flex items-center gap-3">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : health.isError ? (
          <div className="flex items-start gap-3">
            <OctagonXIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium">اتصال برقرار نشد</p>
              <p className="text-sm text-muted-foreground">{getApiErrorMessage(health.error)}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <CircleCheckIcon className="size-4 shrink-0 text-primary" />
            <p className="text-sm">پایگاه داده در دسترس است.</p>
            <Badge variant="secondary">{toPersianDigits(health.data.users)} کاربر ثبت‌شده</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
