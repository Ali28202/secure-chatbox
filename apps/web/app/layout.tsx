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
      // The document itself never scrolls. Regions do.
      //
      // A popup is portalled into `<body>`, so anything it overhangs extends the
      // page's scroll area — the scrollbar appears, every centred column shifts
      // by its width, and the whole layout jumps as menus open and close.
      // Pinning the document to the viewport makes that impossible to happen.
      className={`${vazirmatn.variable} h-full overflow-hidden antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
