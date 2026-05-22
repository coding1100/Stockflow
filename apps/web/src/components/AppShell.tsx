'use client';

import { useState } from 'react';
import { Nav } from './Nav';

/**
 * Responsive app chrome. On md+ the sidebar is permanent; on mobile it becomes an
 * off-canvas drawer behind a top bar with a hamburger. Content is full-width and
 * scrolls horizontally where needed (wide tables), never clipped.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Nav />
      </div>

      {/* Mobile drawer + overlay */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform md:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Nav onNavigate={() => setOpen(false)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="tap-target flex items-center justify-center rounded-lg border border-slate-200 px-3 text-slate-600"
          >
            ☰
          </button>
          <span className="font-display text-lg font-semibold text-brand-700">StockFlow</span>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
