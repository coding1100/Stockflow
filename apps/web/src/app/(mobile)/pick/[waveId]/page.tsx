'use client';

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/react';
import { enqueue, flushOutbox, queueDepth } from '@/lib/offline/outbox';

interface PickLine { skuId: string; skuCode: string; name: string; imageUrl: string | null; qty: number; orderId: string; toteId?: string }
interface Stop { seq: number; binId: string; binCode: string; x: number; y: number; picks: PickLine[] }
interface Route { stops: Stop[] }

const ROUTE_KEY = (id: string) => `sf-route-${id}`;

export default function MobilePickPage({ params }: { params: { waveId: string } }) {
  const { waveId } = params;
  const waveQ = trpc.picking.getWave.useQuery({ id: waveId });
  const start = trpc.picking.startWave.useMutation();
  const confirm = trpc.picking.confirmPick.useMutation();
  const complete = trpc.picking.completeWave.useMutation();

  const [route, setRoute] = useState<Route | null>(null);
  const [idx, setIdx] = useState(0);
  const [binScan, setBinScan] = useState('');
  const [itemScan, setItemScan] = useState('');
  const [forceOffline, setForceOffline] = useState(false);
  const [depth, setDepth] = useState(0);
  const [online, setOnline] = useState(true);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');

  const isOffline = forceOffline || !online;
  const refreshDepth = useCallback(() => queueDepth().then(setDepth), []);

  // Load cached route (offline-resilient) or from the server.
  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem(ROUTE_KEY(waveId)) : null;
    if (cached) setRoute(JSON.parse(cached));
    else if (waveQ.data?.optimizedRoute) {
      const r = waveQ.data.optimizedRoute as unknown as Route;
      setRoute(r);
      localStorage.setItem(ROUTE_KEY(waveId), JSON.stringify(r));
    }
  }, [waveId, waveQ.data]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void flushOutbox().then(refreshDepth); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    void refreshDepth();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [refreshDepth]);

  // Flush when the simulated-offline toggle is switched back on.
  useEffect(() => { if (!isOffline) void flushOutbox().then(refreshDepth); }, [isOffline, refreshDepth]);

  const stop = route?.stops[idx];
  const pickLine = stop?.picks[0];

  async function confirmStop() {
    if (!stop || !pickLine) return;
    setError('');
    const payload = { waveId, scanId: crypto.randomUUID(), stopSeq: stop.seq, binScan, itemScan, qty: pickLine.qty, toteId: pickLine.toteId, occurredAt: new Date().toISOString() };
    // Local validation mirrors the server so offline picks still catch obvious errors.
    if (binScan !== stop.binCode) { setError('Wrong bin'); return; }

    if (isOffline) {
      await enqueue({ scanId: payload.scanId, kind: 'pick', payload, queuedAt: new Date().toISOString() });
      await refreshDepth();
      advance();
    } else {
      try {
        await confirm.mutateAsync(payload);
        advance();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pick failed');
      }
    }
  }

  function advance() {
    setBinScan('');
    setItemScan('');
    if (route && idx < route.stops.length - 1) setIdx(idx + 1);
    else finish();
  }

  async function finish() {
    setFinished(true);
    if (!isOffline) { await flushOutbox(); await complete.mutateAsync({ id: waveId }); }
  }

  if (!route) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-slate-300">This pick list isn't ready yet.</p>
        <button className="rounded-lg bg-brand-600 px-6 py-3" onClick={() => start.mutate({ id: waveId })}>Start picking</button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-6xl">📦</div>
        <h1 className="text-2xl font-semibold">All done</h1>
        <p className="text-slate-300">{route.stops.length} stops picked. Take the items to the pack station.</p>
        {depth > 0 && <p className="text-amber-300">{depth} picks waiting to send — they'll upload when you're back online.</p>}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between bg-slate-800 px-4 py-2 text-sm">
        <span>Stop {idx + 1} / {route.stops.length}</span>
        <div className="flex items-center gap-3">
          {depth > 0 && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300">{depth} waiting to send</span>}
          <button onClick={() => setForceOffline(!forceOffline)} className={`rounded px-2 py-0.5 ${isOffline ? 'bg-rose-500/30 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
            {isOffline ? '✈ Offline' : '● Online'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-slate-700"><div className="h-1 bg-brand-500 transition-all" style={{ width: `${((idx) / route.stops.length) * 100}%` }} /></div>

      {/* Stop */}
      {stop && pickLine && (
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="text-center">
            <div className="text-sm text-slate-400">GO TO SHELF</div>
            <div className="font-mono text-5xl font-bold tracking-tight">{stop.binCode}</div>
          </div>

          <div className="flex items-center gap-4 rounded-2xl bg-slate-800 p-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-700 text-3xl">📦</div>
            <div className="flex-1">
              <div className="text-lg font-semibold">{pickLine.name}</div>
              <div className="font-mono text-xs text-slate-400">{pickLine.skuCode}</div>
              {pickLine.toteId && <div className="mt-1 inline-block rounded bg-brand-600 px-2 py-0.5 text-xs">Basket {pickLine.toteId}</div>}
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold">{pickLine.qty}</div>
              <div className="text-xs text-slate-400">QTY</div>
            </div>
          </div>

          <div className="space-y-2">
            <input value={binScan} onChange={(e) => setBinScan(e.target.value)} placeholder="Scan shelf"
              className="tap-target w-full rounded-xl bg-slate-800 px-4 py-3 text-center font-mono text-lg outline-none focus:ring-2 focus:ring-brand-500" />
            <input value={itemScan} onChange={(e) => setItemScan(e.target.value)} placeholder="Scan item"
              className="tap-target w-full rounded-xl bg-slate-800 px-4 py-3 text-center font-mono text-lg outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {error && <p className="text-center text-rose-400">{error}</p>}

          <div className="mt-auto space-y-2">
            <button onClick={confirmStop} disabled={confirm.isPending}
              className="tap-target w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold disabled:bg-slate-600">
              Confirm pick
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
