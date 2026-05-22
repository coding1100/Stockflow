'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, Input, Spinner } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';
import { useRealtime } from '@/lib/useRealtime';
import { demandLabel, demandTone } from '@/lib/labels';

const TIERS: { value: 'A' | 'B' | 'C'; label: string }[] = [
  { value: 'A', label: 'Fast movers' },
  { value: 'B', label: 'Medium' },
  { value: 'C', label: 'Slow movers' },
];

export default function InventoryPage() {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<'A' | 'B' | 'C' | undefined>();
  const [lowStock, setLowStock] = useState(false);

  const search = trpc.inventory.searchSkus.useQuery({ query: query || undefined, tier, lowStock, limit: 30 });

  // Live: when inventory changes anywhere, refresh the list.
  useRealtime('inventory', () => void utils.inventory.searchSkus.invalidate());

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold">Stock</h1>
        <p className="text-sm text-slate-500">Every item, where it is, and how many are ready to sell</p>
      </header>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="min-w-64 flex-1">
            <Input placeholder="Search by item name or code…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {TIERS.map((t) => (
              <Button key={t.value} size="sm" variant={tier === t.value ? 'primary' : 'secondary'} onClick={() => setTier(tier === t.value ? undefined : t.value)}>
                {t.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant={lowStock ? 'danger' : 'secondary'} onClick={() => setLowStock(!lowStock)}>
            Running low
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {search.isLoading ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Item code</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Demand</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3 text-right">In stock</th>
                  <th className="px-3 py-3 text-right">Ready to sell</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {search.data?.items.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-mono text-xs">{s.code}</td>
                    <td className="px-3 py-2.5">{s.name}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={demandTone(s.tier)}>{demandLabel(s.tier)}</Badge>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{s.binCode}<span className="ml-1 text-slate-300">{s.zone}</span></td>
                    <td className="px-3 py-2.5 text-right">{s.onHand}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={s.lowStock ? 'font-semibold text-rose-600' : ''}>{s.available}</span>
                      {s.lowStock && <Badge tone="red" className="ml-2">running low</Badge>}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link href={`/inventory/${s.id}`} className="text-brand-600 hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
                {search.data?.items.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No items match.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
