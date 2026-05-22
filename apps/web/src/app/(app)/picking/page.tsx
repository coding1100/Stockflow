'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';
import { useRealtime } from '@/lib/useRealtime';
import { deadlineLabel, deadlineTone, pickListStatusLabel, pickListStatusTone } from '@/lib/labels';

export default function PickingPage() {
  const utils = trpc.useUtils();
  const orders = trpc.picking.ordersList.useQuery({ status: 'PENDING', limit: 60 });
  const suggestions = trpc.picking.suggestWaves.useQuery({ maxOrdersPerWave: 6 });
  const waves = trpc.picking.listWaves.useQuery(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const createWave = trpc.picking.createWave.useMutation({
    onSuccess: () => {
      setSelected(new Set());
      void utils.picking.ordersList.invalidate();
      void utils.picking.listWaves.invalidate();
      void utils.picking.suggestWaves.invalidate();
    },
  });

  useRealtime('activity', (m) => { if (m.event === 'order.injected') void utils.picking.ordersList.invalidate(); });
  useRealtime('waves', () => void utils.picking.listWaves.invalidate());

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Picking</h1>
          <p className="text-sm text-slate-500">Group orders, plan the shortest walking route, then send it to a picker</p>
        </div>
        <Button disabled={selected.size === 0 || createWave.isPending} onClick={() => createWave.mutate({ orderIds: [...selected], mode: 'SINGLE' })}>
          Create pick list ({selected.size})
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Orders waiting to be picked */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Orders to pick</CardTitle></CardHeader>
          <CardBody className="p-0">
            {orders.isLoading ? <div className="flex justify-center p-8"><Spinner /></div> : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-2"></th><th className="px-2 py-2">Order</th><th className="px-2 py-2">Sales channel</th><th className="px-2 py-2">Deadline</th><th className="px-2 py-2">Areas</th><th className="px-2 py-2 text-right">Items</th>
                </tr></thead>
                <tbody>
                  {orders.data?.map((o) => (
                    <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} /></td>
                      <td className="px-2 py-2 font-mono text-xs">{o.externalId}</td>
                      <td className="px-2 py-2">{o.channel}</td>
                      <td className="px-2 py-2"><Badge tone={deadlineTone[o.slaBucket]}>{deadlineLabel[o.slaBucket]}</Badge></td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-500">{o.zonesTouched.join('+') || '—'}</td>
                      <td className="px-2 py-2 text-right">{o.unitCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Suggestions + waves */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Suggested pick lists</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {suggestions.data?.slice(0, 4).map((s, i) => (
                <div key={i} className="rounded-lg border border-slate-100 p-3">
                  <div className="text-sm text-slate-600">{s.rationale}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-400">{s.orderIds.length} orders · ~{s.estimatedStops} stops</span>
                    <Button size="sm" variant="secondary" onClick={() => createWave.mutate({ orderIds: s.orderIds, mode: 'SINGLE' })}>Use this</Button>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pick lists</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {waves.data?.map((w) => (
                <Link key={w.id} href={`/picking/waves/${w.id}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                  <span className="font-medium">{w.name}</span>
                  <Badge tone={pickListStatusTone(w.status)}>{pickListStatusLabel[w.status] ?? w.status}</Badge>
                </Link>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
