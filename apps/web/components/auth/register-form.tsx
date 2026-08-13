'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LIMITS, registerSchema, toPersianDigits, type RegisterFormValues } from '@repo/shared';
import { Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { FormError } from '@/components/auth/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api';
import { applyApiFieldIssues } from '@/lib/form-errors';
import { ROUTES } from '@/lib/routes';
import { useRegister } from '@/hooks/use-auth';

const FIELDS = ['name', 'universityId', 'phoneNumber', 'password'] as const;

export function RegisterForm() {
  const router = useRouter();
  const register = useRegister();

  // Typed on the schema's *input*, which is what the fields are bound to: the
  // phone number a user types is normalised on its way through, so what the
  // form holds and what the API receives are not the same value.
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', universityId: '', phoneNumber: '', password: '' },
  });

  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    register.mutate(values, {
      onSuccess: () => router.replace(ROUTES.chats),
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
          <FieldLabel htmlFor="name">نام و نام خانوادگی</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            {...form.register('name')}
          />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="universityId">شناسهٔ دانشگاهی</FieldLabel>
          <Input
            id="universityId"
            dir="ltr"
            className="text-end"
            autoComplete="username"
            aria-invalid={Boolean(errors.universityId)}
            {...form.register('universityId')}
          />
          <FieldDescription>شمارهٔ دانشجویی یا شمارهٔ کارمندی خود را وارد کنید.</FieldDescription>
          <FieldError errors={[errors.universityId]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="phoneNumber">شمارهٔ تلفن همراه</FieldLabel>
          <Input
            id="phoneNumber"
            type="tel"
            inputMode="numeric"
            dir="ltr"
            className="text-end"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phoneNumber)}
            {...form.register('phoneNumber')}
          />
          {/*
           * Persian digits in the hint, Latin digits accepted in the field —
           * `normalizePhoneNumber` folds ۰۹, ٠٩, +98 and 0098 into one canonical
           * form before it is stored, so nobody has to be told which to type.
           */}
          <FieldDescription>مانند {toPersianDigits('09123456789')}.</FieldDescription>
          <FieldError errors={[errors.phoneNumber]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">گذرواژه</FieldLabel>
          <Input
            id="password"
            type="password"
            dir="ltr"
            className="text-end"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...form.register('password')}
          />
          <FieldDescription>دست‌کم {toPersianDigits(LIMITS.password.min)} نویسه.</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>

        {/*
         * No role selector, deliberately. Everyone who registers themselves is
         * a student — a form that could mint a professor account would hand out
         * the right to create course groups and delete other people's messages.
         * The API's `registerSchema` has no `role` field either, so sending one
         * by hand achieves nothing.
         */}
        <Button type="submit" disabled={register.isPending}>
          {register.isPending && <Loader2Icon className="animate-spin" />}
          ساخت حساب کاربری
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          حساب کاربری دارید؟{' '}
          <Link
            href={ROUTES.login}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            وارد شوید
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
