'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LIMITS, registerSchema, toPersianDigits, type RegisterFormValues } from '@repo/shared';
import { ClockIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
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
  const register = useRegister();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', universityId: '', phoneNumber: '', password: '' },
  });

  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    register.mutate(values, {
      onError: (error) => {
        if (!applyApiFieldIssues(error, form.setError, FIELDS)) {
          form.setError('root', { message: getApiErrorMessage(error) });
        }
      },
    });
  });

  if (register.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
        <ClockIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">درخواستت ثبت شد</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          حسابت ساخته شد، ولی تا مدیر سامانه تأییدش نکنه نمی‌تونی وارد شی. بعدش با همین شماره
          دانشجویی و گذرواژه وارد شو.
        </p>
        <Button variant="outline" size="sm" render={<Link href={ROUTES.login} />}>
          رفتن به صفحهٔ ورود
        </Button>
      </div>
    );
  }

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
          <FieldLabel htmlFor="universityId">شماره دانشجویی</FieldLabel>
          <Input
            id="universityId"
            dir="ltr"
            className="text-end"
            autoComplete="username"
            aria-invalid={Boolean(errors.universityId)}
            {...form.register('universityId')}
          />
          <FieldDescription>شماره دانشجوییت رو بنویس</FieldDescription>
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

          <FieldDescription>مثل {toPersianDigits('09123456789')}</FieldDescription>
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
          <FieldDescription>حداقل {toPersianDigits(LIMITS.password.min)} کاراکتر</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>

        <Button type="submit" disabled={register.isPending}>
          {register.isPending && <Loader2Icon className="animate-spin" />}
          ساخت حساب
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          حساب داری؟{' '}
          <Link
            href={ROUTES.login}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            وارد شو
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
