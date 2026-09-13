import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Scrolls itself, because the document no longer can: a tall form on a
    // short screen would otherwise be cut off with no way to reach the button.
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
