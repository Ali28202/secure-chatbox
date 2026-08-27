import type { Metadata } from 'next';
import { vazirmatn } from '@/lib/fonts';
import { AppProviders } from '@/providers/app-providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'چت‌باکس',
    template: '%s | چت‌باکس',
  },
  description: 'سامانهٔ گفت‌وگوی امن استادان و دانشجویان در شبکهٔ داخلی دانشگاه.',
  applicationName: 'چت‌باکس',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
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
