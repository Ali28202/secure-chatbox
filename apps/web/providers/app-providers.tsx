'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { DirectionProvider } from '@/components/ui/direction';
import { Toaster } from '@/components/ui/sonner';
import { createQueryClient } from '@/lib/query-client';

/**
 * Everything the client tree needs, in one place, mounted once by the root
 * layout.
 *
 * The layout itself stays a server component — only this file is `'use client'`
 * — so pages below can still be server-rendered.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // `useState` with an initializer, not a module-level constant: a constant is
  // created once per *process*, which on the server means every visitor shares
  // one cache. This creates one client per mount and keeps it across re-renders.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {/*
         * `dir="rtl"` on <html> handles ordinary layout, but Base UI's
         * positioning logic for popovers, dropdowns and tooltips computes
         * placement in JavaScript and cannot read the DOM attribute. This is how
         * it learns the direction; without it, menus open off the wrong edge.
         */}
        <DirectionProvider direction="rtl">
          {children}
          {/* Outside the page tree so a route change never unmounts a visible toast. */}
          <Toaster position="bottom-left" dir="rtl" richColors closeButton />
        </DirectionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
