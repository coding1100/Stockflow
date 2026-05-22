'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Spinner } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';
import { useRealtime } from '@/lib/useRealtime';
import { activityLabel, demandLabel, demandTone } from '@/lib/labels';

export default function SkuDetailPage({ params }: { params: { skuId: string } }) {
  const { skuId } = params;
  const utils = trpc.useUtils();
  const sku = trpc.inventory.getSku.useQuery({ id: skuId });
  const txs = trpc.inventory.getSkuTransactions.useQuery({ skuId });

  useRealtime('inventory', (msg) => {
    if ((msg.payload as { skuId?: string })?.skuId === skuId) {
      void utils.inventory.getSku.invalidate({ id: skuId });
      void utils.inventory.getSkuTransactions.invalidate({ skuId });
    }
  });

  if (sku.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (!sku.data) return <p>Not found.</p>;
  const s = sku.data;

  return (
    <div className="space-y-5">
      <Link href="/inventory" className="text-sm text-brand-600 hover:underline">← Stock</Link>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">{s.name}</h1>
          <p className="font-mono text-sm text-slate-500">{s.code} · {s.category} · {s.brand}</p>
        </div>
        <Badge tone={demandTone(s.velocityTier)}>{demandLabel(s.velocityTier)} mover</Badge>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="In stock" value={s.rollup.onHand} />
        <Stat label="Promised to orders" value={s.rollup.allocated} />
        <Stat label="Set aside" value={s.rollup.reserved} />
        <Stat label="Ready to sell" value={s.available} highlight={s.available <= s.minStock} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OversellDemo skuId={skuId} available={s.available} onDone={() => utils.inventory.getSku.invalidate({ id: skuId })} />

        <Card>
          <CardHeader><CardTitle>Where it's stored</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm">
            {s.inventory.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <span className="font-mono text-xs">{r.bin?.code} <span className="text-slate-400">{r.bin?.zone.code}</span></span>
                <span>{r.onHand} units</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <tbody>
              {txs.data?.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="px-5 py-2 text-xs uppercase text-slate-400">{activityLabel[t.type] ?? t.type}</td>
                  <td className="px-3 py-2">{new Date(t.occurredAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-500">{t.user?.name ?? 'system'}</td>
                  <td className={`px-5 py-2 text-right ${t.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{t.quantity > 0 ? '+' : ''}{t.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`font-display text-2xl font-semibold ${highlight ? 'text-rose-600' : ''}`}>{value}</div>
      </CardBody>
    </Card>
  );
}

/** Reserve stock for an order — the system won't let you promise more than you have. */
function OversellDemo({ skuId, available, onDone }: { skuId: string; available: number; onDone: () => void }) {
  const [qty, setQty] = useState(1);
  const [result, setResult] = useState<string | null>(null);
  const reserve = trpc.inventory.reserve.useMutation({
    onSuccess: (r) => {
      setResult(
        r.ok
          ? `✓ Set aside ${r.granted}. ${r.available} still ready to sell.`
          : `✗ Can't — only ${r.available} ready to sell. We won't promise stock you don't have.`,
      );
      onDone();
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle>Reserve stock for an order</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-slate-500">Set aside items for an online order. The system blocks anything beyond what's ready to sell.</p>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-24" />
          <Button onClick={() => reserve.mutate({ skuId, channel: 'ECOM', qty })} disabled={reserve.isPending}>Reserve</Button>
          <span className="text-sm text-slate-400">{available} ready</span>
        </div>
        {result && <p className={`text-sm ${result.startsWith('✓') ? 'text-emerald-600' : 'text-rose-600'}`}>{result}</p>}
      </CardBody>
    </Card>
  );
}
