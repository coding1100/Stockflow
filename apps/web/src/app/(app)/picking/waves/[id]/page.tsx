'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';
import { WarehouseMap } from '@/components/WarehouseMap';
import { pickListStatusLabel, pickListStatusTone } from '@/lib/labels';

interface Stop { seq: number; x: number; y: number; binCode: string; picks: { qty: number }[] }
interface Route { stops: Stop[]; totalDistance: number; estimatedDurationSec: number }

function manhattanPath(pts: { x: number; y: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.abs(pts[i]!.x - pts[i - 1]!.x) + Math.abs(pts[i]!.y - pts[i - 1]!.y);
  return d;
}

export default function WaveDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const utils = trpc.useUtils();
  const wave = trpc.picking.getWave.useQuery({ id });
  const zones = trpc.picking.zones.useQuery();
  const [showNaive, setShowNaive] = useState(false);

  const optimize = trpc.picking.optimizeWave.useMutation({ onSuccess: () => utils.picking.getWave.invalidate({ id }) });
  const release = trpc.picking.releaseWave.useMutation({ onSuccess: () => utils.picking.getWave.invalidate({ id }) });

  const route = wave.data?.optimizedRoute as unknown as Route | null;

  const { naiveStops, improvement } = useMemo(() => {
    if (!route?.stops?.length || !zones.data) return { naiveStops: [] as Stop[], improvement: 0 };
    const depot = zones.data.depot;
    const naive = [...route.stops].sort((a, b) => a.binCode.localeCompare(b.binCode));
    const naiveDist = manhattanPath([depot, ...naive.map((s) => ({ x: s.x, y: s.y })), depot]);
    const optDist = manhattanPath([depot, ...route.stops.map((s) => ({ x: s.x, y: s.y })), depot]);
    const imp = naiveDist > 0 ? Math.round(((naiveDist - optDist) / naiveDist) * 100) : 0;
    return { naiveStops: naive, improvement: Math.max(imp, 0) };
  }, [route, zones.data]);

  if (wave.isLoading || zones.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (!wave.data) return <p>Not found.</p>;
  const w = wave.data;

  return (
    <div className="space-y-5">
      <Link href="/picking" className="text-sm text-brand-600 hover:underline">← Picking</Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Pick list {w.name}</h1>
          <p className="text-sm text-slate-500">{w.orderIds.length} orders · picker {w.picker?.name ?? 'unassigned'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={pickListStatusTone(w.status)}>{pickListStatusLabel[w.status] ?? w.status}</Badge>
          <Button variant="secondary" onClick={() => optimize.mutate({ id })} disabled={optimize.isPending}>{optimize.isPending ? 'Planning…' : 'Plan best route'}</Button>
          {route && w.status === 'DRAFT' && <Button onClick={() => release.mutate({ id })} disabled={release.isPending}>Send to picker</Button>}
          {(w.status === 'RELEASED' || w.status === 'IN_PROGRESS') && (
            <Link href={`/pick/${id}`} target="_blank"><Button>Open on picker's phone</Button></Link>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Route map</CardTitle>
            {route && (
              <div className="flex items-center gap-3">
                {improvement > 0 && <Badge tone="green">−{improvement}% walking</Badge>}
                <label className="flex items-center gap-1.5 text-sm text-slate-500">
                  <input type="checkbox" checked={showNaive} onChange={(e) => setShowNaive(e.target.checked)} /> show before
                </label>
              </div>
            )}
          </CardHeader>
          <CardBody>
            {route ? (
              <WarehouseMap zones={zones.data!.zones} bins={zones.data!.bins} depot={zones.data!.depot} route={route} naiveRoute={naiveStops} showNaive={showNaive} />
            ) : (
              <div className="flex h-64 items-center justify-center text-slate-400">Click “Plan best route” to map the shortest walking path.</div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Route stops</CardTitle></CardHeader>
          <CardBody className="max-h-[420px] space-y-1 overflow-y-auto">
            {route?.stops.map((s) => (
              <div key={s.seq} className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{s.seq}</span>
                <span className="font-mono text-xs">{s.binCode}</span>
                <span className="ml-auto text-slate-400">{s.picks.reduce((a, p) => a + p.qty, 0)} u</span>
              </div>
            ))}
            {route && <div className="pt-2 text-xs text-slate-400">Est. {Math.round((route.estimatedDurationSec ?? 0) / 60)} min · {route.stops.length} stops</div>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
