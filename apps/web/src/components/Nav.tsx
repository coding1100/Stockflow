'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@stockflow/ui';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/inventory', label: 'Stock', icon: '▤' },
  { href: '/inventory/cycle-counts', label: 'Stock Checks', icon: '✓' },
  { href: '/picking', label: 'Picking', icon: '➜' },
  { href: '/picking/performance', label: 'Picker Stats', icon: '◷' },
];

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-5">
        <div className="font-display text-2xl font-semibold text-brand-700">StockFlow</div>
        <div className="text-xs text-slate-400">Central DC · Live</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {LINKS.map((l) => {
          const active = pathname === l.href || (l.href !== '/dashboard' && pathname.startsWith(l.href) && l.href !== '/inventory') || pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className="w-4 text-center text-slate-400">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4 text-sm">
        <div className="font-medium text-slate-800">{session?.user?.name ?? '—'}</div>
        <div className="text-xs text-slate-400">{session?.user?.role?.replace('_', ' ').toLowerCase()}</div>
        <button onClick={() => signOut({ callbackUrl: '/login' })} className="mt-2 text-xs text-slate-500 hover:text-rose-600">
          Sign out
        </button>
      </div>
    </aside>
  );
}
