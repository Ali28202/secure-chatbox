import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NEXT_PARAM, safeRedirectTarget } from '@/lib/routes';

export const metadata: Metadata = { title: 'ورود' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // `searchParams` is a Promise in Next 16 — awaiting it here keeps the form a
  // plain client component with no `useSearchParams`, and therefore no Suspense
  // boundary to remember.
  const params = await searchParams;
  const requested = params[NEXT_PARAM];
  const redirectTo = safeRedirectTarget(typeof requested === 'string' ? requested : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">ورود به چت‌باکس امن</CardTitle>
        <CardDescription>با شناسهٔ دانشگاهی و گذرواژهٔ خود وارد شوید.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm redirectTo={redirectTo} />
      </CardContent>
    </Card>
  );
}
