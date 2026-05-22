'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, Input, Spinner } from '@stockflow/ui';
import { trpc } from '@/lib/trpc/react';

/** Glove-friendly mobile count: step bin-by-bin, scan, enter count, post variances. */
export default function CountExecutionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const count = trpc.inventory.getCycleCount.useQuery({ id });
  const post = trpc.inventory.postCycleCount.useMutation();
  const [idx, setIdx] = useState(0);
  const [entries, setEntries] = useState<Record<string, number>>({});
  const [done, setDone] = useState<{ accuracy: number; totalAbsVariance: number } | null>(null);

  const lines = count.data?.lines ?? [];
  const line = lines[idx];
  const counted = line ? entries[line.id] : undefined;

  const summary = useMemo(() => {
    const submitted = Object.entries(entries).map(([lineId, qty]) => ({ lineId, countedQty: qty }));
    return submitted;
  }, [entries]);

  if (count.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;

  if (done) {
    return (
      <Card className="mx-auto max-w-md">
        <CardBody className="space-y-3 text-center">
          <div className="text-5xl">✓</div>
          <h2 className="font-display text-xl font-semibold">Stock check complete</h2>
          <p className="text-slate-600">Accuracy {(done.accuracy * 100).toFixed(1)}% · {done.totalAbsVariance} units off</p>
          <p className="text-sm text-slate-400">Stock updated automatically — the dashboard accuracy just changed.</p>
          <Button onClick={() => router.push('/inventory/cycle-counts')}>Done</Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="text-center text-sm text-slate-500">Shelf {idx + 1} of {lines.length}</div>
      {line && (
        <Card>
          <CardBody className="space-y-4">
            <div className="text-center">
              <div className="font-mono text-3xl font-bold">{line.binCode}</div>
              <div className="mt-1 text-slate-600">{line.sku?.name}</div>
              <div className="font-mono text-xs text-slate-400">{line.sku?.code}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 text-center">
              <div className="text-xs uppercase text-slate-400">System says</div>
              <div className="font-display text-2xl font-semibold">{line.expectedQty}</div>
            </div>
            <label className="block text-sm font-medium text-slate-600">How many did you count?</label>
            <Input
              type="number"
              inputMode="numeric"
              className="h-14 text-center text-2xl"
              value={counted ?? ''}
              onChange={(e) => setEntries((p) => ({ ...p, [line.id]: Number(e.target.value) }))}
              autoFocus
            />
            {counted !== undefined && counted !== line.expectedQty && (
              <p className="text-center text-sm font-medium text-amber-600">Difference: {counted - line.expectedQty}</p>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" className="flex-1" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Back</Button>
              {idx < lines.length - 1 ? (
                <Button size="lg" className="flex-1" disabled={counted === undefined} onClick={() => setIdx(idx + 1)}>Next shelf</Button>
              ) : (
                <Button
                  size="lg"
                  className="flex-1"
                  disabled={post.isPending || summary.length === 0}
                  onClick={() => post.mutate({ id, lines: summary }, { onSuccess: (r) => setDone(r) })}
                >
                  {post.isPending ? 'Posting…' : 'Finish & post'}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
