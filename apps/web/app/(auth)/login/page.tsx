import { ERROR_CODES, FA_ERROR_MESSAGES } from '@repo/shared';
import type { Metadata } from 'next';
import { FormError } from '@/components/auth/form-error';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DEVICE_MISMATCH_PARAM, NEXT_PARAM, safeRedirectTarget } from '@/lib/routes';

export const metadata: Metadata = { title: 'ورود' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // `searchParams` is a Promise in Next 16 — awaiting it here keeps the form a
  // plain client component with no `useSearchParams`, and therefore no Suspense
  // boundary to remember.
  const params = await searchParams;
  const requested = params[NEXT_PARAM];
  const redirectTo = safeRedirectTarget(typeof requested === 'string' ? requested : null);

  // Set by `forceReLogin` in `lib/api.ts`, which lands here after the account
  // signed in somewhere else. Without it this looks like an ordinary logout and
  // the natural conclusion is that the app dropped the session by itself.
  const displaced = params[DEVICE_MISMATCH_PARAM] !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">ورود به چت‌باکس امن</CardTitle>
        <CardDescription>
          با شناسهٔ دانشگاهی یا شمارهٔ تلفن و گذرواژهٔ خود وارد شوید.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {displaced && <FormError message={FA_ERROR_MESSAGES[ERROR_CODES.DEVICE_MISMATCH]} />}
        <LoginForm redirectTo={redirectTo} />
      </CardContent>
    </Card>
  );
}
