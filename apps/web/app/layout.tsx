import type { Metadata } from 'next';
import { vazirmatn } from '@/lib/fonts';
import { AppProviders } from '@/providers/app-providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'چت‌باکس امن دانشگاه',
    template: '%s | چت‌باکس امن دانشگاه',
  },
  description:
    'سامانهٔ گفت‌وگوی امن استادان و دانشجویان در شبکهٔ داخلی دانشگاه، بدون وابستگی به اینترنت و بدون سپردن گفت‌وگوهای آموزشی به پیام‌رسان‌های بیرونی.',
  applicationName: 'چت‌باکس امن',
  // The platform is only reachable from 192.168.0.0/16, so a crawler could
  // never fetch it anyway — but saying so costs one line and settles any doubt
  // about academic conversations turning up in a search engine.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    /*
     * `lang="fa"` drives font selection, line breaking and the accessibility
     * tree; `dir="rtl"` mirrors the whole layout. Both belong on <html> so no
     * subtree can be left facing the wrong way.
     *
     * `suppressHydrationWarning` is required by next-themes: it writes the
     * theme class onto this element before React hydrates, which is by
     * definition a server/client mismatch. It suppresses the warning for this
     * element's own attributes only — not for the tree below it.
     */
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      className={`${vazirmatn.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
