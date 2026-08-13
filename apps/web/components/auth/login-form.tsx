'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginFormSchema, type LoginFormValues } from '@repo/shared';
import { Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { FormError } from '@/components/auth/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api';
import { applyApiFieldIssues } from '@/lib/form-errors';
import { ROUTES } from '@/lib/routes';
import { useLogin } from '@/hooks/use-auth';

const FIELDS = ['identifier', 'password'] as const;

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const login = useLogin();

  const form = useForm<LoginFormValues>({
    // `loginFormSchema`, not `loginSchema` — the request carries a device id
    // that no one types and the form therefore has no field for. Otherwise the
    // same schema the API validates with, so the messages a user sees for a
    // too-short password are identical on both sides — and already in Persian.
    resolver: zodResolver(loginFormSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => router.replace(redirectTo),
      onError: (error) => {
        if (!applyApiFieldIssues(error, form.setError, FIELDS)) {
          form.setError('root', { message: getApiErrorMessage(error) });
        }
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={errors.root?.message} />

        <Field>
          <FieldLabel htmlFor="identifier">شناسهٔ دانشگاهی یا شمارهٔ تلفن</FieldLabel>
          {/*
           * `dir="ltr"` because both a student number and a phone number are
           * digit strings and would otherwise be reordered by the surrounding
           * RTL context; `text-end` keeps them visually aligned with the rest of
           * the form.
           */}
          <Input
            id="identifier"
            dir="ltr"
            className="text-end"
            autoComplete="username"
            autoFocus
            aria-invalid={Boolean(errors.identifier)}
            {...form.register('identifier')}
          />
          <FieldError errors={[errors.identifier]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">گذرواژه</FieldLabel>
          <Input
            id="password"
            type="password"
            dir="ltr"
            className="text-end"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...form.register('password')}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        <Button type="submit" disabled={login.isPending}>
          {login.isPending && <Loader2Icon className="animate-spin" />}
          ورود به سامانه
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          حساب کاربری ندارید؟{' '}
          <Link
            href={ROUTES.register}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            ثبت‌نام کنید
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
