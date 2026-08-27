import { LockKeyholeIcon, MessagesSquareIcon, NetworkIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/routes';

const FEATURES = [
  {
    icon: MessagesSquareIcon,
    title: 'ارتباط در لحظه',
    description:
      'خیلی راحت و سریع با استادها و هم‌کلاسی‌هات چت کن؛ چه تو پیام خصوصی، چه تو گروه‌های درسی.',
  },
  {
    icon: LockKeyholeIcon,
    title: 'امنیت کامل',
    description:
      'خیالت راحت! با شناسه و رمز دانشگاهیت وارد شو؛ ما حواسمون به امنیت حسابت هست و اطلاعاتت پیش ما جاش امنه.',
  },
  {
    icon: NetworkIcon,
    title: 'اختصاصیِ دانشگاه',
    description:
      'این سیستم فقط با اینترنت دانشگاه باز می‌شه؛ یه فضای کاملاً اختصاصی که هیچ اطلاعات و پیامی ازش بیرون نمی‌ره.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">چت‌باکس</h1>
        <p className="text-lg text-pretty text-muted-foreground">
          سامانهٔ گفت‌وگو و کنترل دسترسی درون‌شبکه‌ای برای استادان و دانشجویان.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button render={<Link href={ROUTES.login} />}>ورود به سامانه</Button>
          <Button variant="outline" render={<Link href={ROUTES.register} />}>
            ساخت حساب کاربری
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardContent className="space-y-2">
              <Icon className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="leading-6">{description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
