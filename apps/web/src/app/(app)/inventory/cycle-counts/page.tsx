'use client';

import Link from 'next/link';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';

export default function CycleCountsPage() {
  const utils = trpc.useUtils();
  const counts = trpc.inventory.listCycleCounts.useQuery();
  const create = trpc.inventory.createCycleCount.useMutation({ onSuccess: () => utils.inventory.listCycleCounts.invalidate() });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Stock Checks</h1>
          <p className="text-sm text-slate-500">Re-count a handful of shelves to keep the numbers honest — no shutdown needed</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => create.mutate({ scope: 'ZONE', scopeValue: 'A' })}>Check Zone A</Button>
          <Button onClick={() => create.mutate({ scope: 'TIER', scopeValue: 'A' })} disabled={create.isPending}>Check fast movers</Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Checks</CardTitle></CardHeader>
        <CardBody className="space-y-2">
          {counts.data?.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
              <div>
                <div className="font-medium">{c.scope === 'ZONE' ? `Zone ${c.scopeValue}` : 'Fast movers'}</div>
                <div className="text-xs text-slate-400">{c.lines.length} shelves · {c.assignee?.name ?? 'unassigned'}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={c.status === 'COMPLETED' ? 'green' : 'amber'}>{c.status === 'COMPLETED' ? 'Done' : 'To do'}</Badge>
                {c.status !== 'COMPLETED' && (
                  <Link href={`/inventory/cycle-counts/${c.id}`}><Button size="sm">Start check</Button></Link>
                )}
              </div>
            </div>
          ))}
          {counts.data?.length === 0 && <p className="py-6 text-center text-slate-400">No checks yet. Start one above.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
