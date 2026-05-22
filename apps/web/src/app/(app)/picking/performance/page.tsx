'use client';

import { Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';

export default function PerformancePage() {
  const perf = trpc.picking.performanceByPicker.useQuery();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold">Picker Performance</h1>
        <p className="text-sm text-slate-500">Coaching from data — actual vs. estimated, per picker</p>
      </header>
      <Card>
        <CardHeader><CardTitle>Completed pick lists</CardTitle></CardHeader>
        <CardBody className="p-0">
          {perf.isLoading ? <div className="flex justify-center p-8"><Spinner /></div> : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-5 py-3">Picker</th><th className="px-3 py-3 text-right">Pick lists</th><th className="px-3 py-3 text-right">Avg time</th><th className="px-3 py-3 text-right">Expected</th><th className="px-5 py-3 text-right">vs expected</th>
              </tr></thead>
              <tbody>
                {perf.data?.map((p) => (
                  <tr key={p.pickerId} className="border-b border-slate-50">
                    <td className="px-5 py-2.5 font-medium">{p.name}</td>
                    <td className="px-3 py-2.5 text-right">{p.waves}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(p.avgActualSec / 60)}m</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(p.avgEstimateSec / 60)}m</td>
                    <td className="px-5 py-2.5 text-right">
                      <Badge tone={p.vsEstimatePct <= 0 ? 'green' : 'amber'}>{p.vsEstimatePct > 0 ? '+' : ''}{p.vsEstimatePct}%</Badge>
                    </td>
                  </tr>
                ))}
                {perf.data?.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Complete a pick list to see performance.</td></tr>}
              </tbody>
            </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
