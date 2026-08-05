import { LockKeyholeIcon, MessagesSquareIcon, NetworkIcon } from 'lucide-react';
import { ConnectionStatus } from '@/components/system/connection-status';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

const FEATURES = [
  {
    icon: MessagesSquareIcon,
    title: 'گفت‌وگوی آنی',
    description:
      'پیام‌های خصوصی میان استاد و دانشجو و گروه‌های درسی، با تحویل بی‌درنگ و نشانه‌گذاری خوانده‌شدن.',
  },
  {
    icon: LockKeyholeIcon,
    title: 'نشست امن',
    description:
      'ورود با شناسهٔ دانشگاهی و گذرواژه، نشست بر پایهٔ JWT در کوکی‌های HttpOnly و دسترسی مبتنی بر نقش.',
  },
  {
    icon: NetworkIcon,
    title: 'فقط شبکهٔ داخلی',
    description:
      'سامانه تنها از درون شبکهٔ دانشگاه در دسترس است؛ هیچ گفت‌وگویی از مرزهای دانشگاه بیرون نمی‌رود.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          چت‌باکس امن دانشگاه
        </h1>
        <p className="text-lg text-pretty text-muted-foreground">
          سامانهٔ گفت‌وگو و کنترل دسترسی درون‌شبکه‌ای برای استادان و دانشجویان.
        </p>
      </header>

      <ConnectionStatus />

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
