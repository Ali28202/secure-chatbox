import { ERROR_CODES, FA_ERROR_MESSAGES } from '@repo/shared';
import type { Metadata } from 'next';
import { FormError } from '@/components/auth/form-error';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DEVICE_MISMATCH_PARAM, NEXT_PARAM, safeRedirectTarget } from '@/lib/routes';

export const metadata: Metadata = { title: 'ورود' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const requested = params[NEXT_PARAM];
  const redirectTo = safeRedirectTarget(typeof requested === 'string' ? requested : null);

  const displaced = params[DEVICE_MISMATCH_PARAM] !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">ورود به چت‌باکس</CardTitle>
        <CardDescription>با شماره دانشجویی یا شمارهٔ تلفن و گذرواژهٔ خودت وارد شو</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {displaced && <FormError message={FA_ERROR_MESSAGES[ERROR_CODES.DEVICE_MISMATCH]} />}
        <LoginForm redirectTo={redirectTo} />
      </CardContent>
    </Card>
  );
}
