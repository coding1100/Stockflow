'use client';

import { useState } from 'react';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';
import { useRealtime } from '@/lib/useRealtime';
import { Sparkline } from '@/components/Sparkline';
import { activityLabel } from '@/lib/labels';

interface FeedItem {
  id: string;
  label: string;
  tone: 'green' | 'blue' | 'amber' | 'red' | 'slate';
  at: string;
}

export default function DashboardPage() {
  const utils = trpc.useUtils();
  const kpis = trpc.dashboard.kpis.useQuery();
  const attention = trpc.dashboard.needsAttention.useQuery();
  const throughput = trpc.dashboard.throughput.useQuery({ days: 21 });
  const activity = trpc.dashboard.activity.useQuery({ limit: 12 });
  const [live, setLive] = useState<FeedItem[]>([]);

  // Live updates: refresh KPIs/feed as picks, counts and orders happen.
  useRealtime('dashboard', (msg) => {
    void utils.dashboard.kpis.invalidate();
    if (msg.event === 'pick.confirmed') addLive(setLive, { tone: 'green', label: 'Item picked' });
    if (msg.event === 'wave.completed') addLive(setLive, { tone: 'blue', label: 'Pick list completed' });
    if (msg.event === 'count.posted') addLive(setLive, { tone: 'amber', label: 'Stock check posted — accuracy updated' });
  });
  useRealtime('activity', (msg) => {
    if (msg.event === 'order.injected') addLive(setLive, { tone: 'slate', label: 'New online order received' });
    if (msg.event === 'stock.low') addLive(setLive, { tone: 'red', label: 'Item running low' });
    void utils.dashboard.activity.invalidate();
  });

  const k = kpis.data;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Operations Overview</h1>
          <p className="text-sm text-slate-500">Your warehouse at a glance — updated the moment something is scanned</p>
        </div>
        <Badge tone="green">● Live</Badge>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title="Stock Accuracy"
          value={k ? `${(k.stockAccuracy.value * 100).toFixed(1)}%` : '—'}
          delta={k ? `${k.stockAccuracy.deltaPts >= 0 ? '+' : ''}${k.stockAccuracy.deltaPts.toFixed(1)} pts` : ''}
          positive={(k?.stockAccuracy.deltaPts ?? 0) >= 0}
          spark={k?.stockAccuracy.sparkline ?? []}
          target="target 98%"
        />
        <KpiTile
          title="Average Pick Time"
          value={k ? `${Math.round(k.avgPickTimeSec.value / 60)}m ${k.avgPickTimeSec.value % 60}s` : '—'}
          delta={k ? `${k.avgPickTimeSec.deltaPct >= 0 ? '+' : ''}${k.avgPickTimeSec.deltaPct.toFixed(0)}%` : ''}
          positive={(k?.avgPickTimeSec.deltaPct ?? 0) <= 0}
          spark={k?.avgPickTimeSec.sparkline ?? []}
          target="goal 4m"
        />
        <KpiTile
          title="Items Picked Today"
          value={k ? `${k.throughputToday.value}` : '—'}
          delta="items"
          positive
          spark={k?.throughputToday.sparkline ?? []}
          target="picked so far"
        />
        <KpiTile
          title="Staff Hours"
          value={k ? `${k.laborHours.value}h` : '—'}
          delta="-20% goal"
          positive
          spark={k?.laborHours.sparkline ?? []}
          target="estimated today"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Throughput */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Items picked — last 21 days</CardTitle></CardHeader>
          <CardBody>
            <ThroughputChart data={throughput.data ?? []} />
          </CardBody>
        </Card>

        {/* Needs attention */}
        <Card>
          <CardHeader><CardTitle>Needs Attention</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <AttentionRow label="Items running low" value={attention.data?.lowStockSkus ?? 0} tone="red" />
            <AttentionRow label="Late orders" value={attention.data?.overdueOrders ?? 0} tone="amber" />
            <AttentionRow label="Active pick lists" value={attention.data?.openWaves ?? 0} tone="blue" />
          </CardBody>
        </Card>
      </div>

      {/* Live activity feed */}
      <Card>
        <CardHeader><CardTitle>Live Activity</CardTitle></CardHeader>
        <CardBody className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {live.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2">
              <Badge tone={f.tone}>now</Badge>
              <span>{f.label}</span>
            </div>
          ))}
          {(activity.data ?? []).map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-1.5 text-slate-600">
              <span className="w-20 text-xs uppercase text-slate-400">{activityLabel[a.type] ?? a.type}</span>
              <span className="flex-1">{a.sku} · {a.name}</span>
              <span className={a.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}>{a.quantity > 0 ? '+' : ''}{a.quantity}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function addLive(set: React.Dispatch<React.SetStateAction<FeedItem[]>>, item: Omit<FeedItem, 'id' | 'at'>) {
  set((prev) => [{ ...item, id: crypto.randomUUID(), at: new Date().toISOString() }, ...prev].slice(0, 8));
}

function KpiTile({ title, value, delta, positive, spark, target }: { title: string; value: string; delta: string; positive: boolean; spark: number[]; target: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</div>
        <div className="mt-1 flex items-end justify-between">
          <span className="font-display text-3xl font-semibold">{value}</span>
          <span className={`text-sm font-medium ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>{delta}</span>
        </div>
        <Sparkline data={spark} className={positive ? 'text-emerald-500' : 'text-rose-400'} />
        <div className="text-xs text-slate-400">{target}</div>
      </CardBody>
    </Card>
  );
}

function ThroughputChart({ data }: { data: { day: string; received: number; picked: number; shipped: number }[] }) {
  const max = Math.max(...data.map((d) => Math.max(d.picked, d.received, d.shipped)), 1);
  return (
    <div className="flex h-44 items-end gap-1">
      {data.map((d) => (
        <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${d.day}: ${d.picked} picked`}>
          <div className="w-full rounded-t bg-brand-500" style={{ height: `${(d.picked / max) * 100}%` }} />
          <div className="w-full bg-slate-200" style={{ height: `${(d.received / max) * 30}%` }} />
        </div>
      ))}
    </div>
  );
}

function AttentionRow({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'blue' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}
