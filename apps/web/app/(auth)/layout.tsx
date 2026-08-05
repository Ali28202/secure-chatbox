import type { ReactNode } from 'react';

/**
 * The frame around the login and register forms.
 *
 * A route group — the `(auth)` folder name does not appear in the URL — so
 * these pages sit at `/login` and `/register` while sharing this centred
 * layout and staying out of the authenticated shell.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
