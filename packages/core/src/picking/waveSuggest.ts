import type { OrderPlanInfo } from './types.js';

export interface WaveSuggestion {
  orderIds: string[];
  sharedZones: string[];
  estimatedStops: number;
  rationale: string;
}

export interface SuggestOptions {
  maxOrdersPerWave: number;
  strategy?: 'zone' | 'sla' | 'channel';
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setB = new Set(b);
  const inter = a.filter((z) => setB.has(z)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Propose pickable waves without persisting. Orders are first bucketed by (channel,
 * slaBucket) — you don't mix a wholesale pallet order with single-line ecom — then,
 * within a bucket, orders are greedily merged by warehouse-zone overlap (Jaccard) so a
 * single walk covers nearby bins. This is what minimises double-walking and produces the
 * "−N% walking" win the optimizer then realises.
 */
export function suggestWaves(orders: OrderPlanInfo[], opts: SuggestOptions): WaveSuggestion[] {
  const buckets = new Map<string, OrderPlanInfo[]>();
  for (const o of orders) {
    const key = `${o.channel}|${o.slaBucket}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(o);
  }

  const suggestions: WaveSuggestion[] = [];
  for (const [key, bucketOrders] of buckets) {
    const [channel, sla] = key.split('|');
    const remaining = [...bucketOrders];
    while (remaining.length > 0) {
      const seed = remaining.shift()!;
      const group = [seed];
      const zones = new Set(seed.zonesTouched);

      // Greedily pull in the most zone-similar remaining orders until the wave is full.
      while (group.length < opts.maxOrdersPerWave && remaining.length > 0) {
        let bestIdx = -1;
        let bestSim = -1;
        for (let i = 0; i < remaining.length; i++) {
          const sim = jaccard([...zones], remaining[i]!.zonesTouched);
          if (sim > bestSim) {
            bestSim = sim;
            bestIdx = i;
          }
        }
        if (bestIdx < 0 || bestSim <= 0) break; // no zone overlap left — start a new wave
        const picked = remaining.splice(bestIdx, 1)[0]!;
        group.push(picked);
        picked.zonesTouched.forEach((z) => zones.add(z));
      }

      const sharedZones = [...zones].sort();
      const estimatedStops = countDistinctBins(group);
      suggestions.push({
        orderIds: group.map((o) => o.id),
        sharedZones,
        estimatedStops,
        rationale: `${group.length} ${channel?.toLowerCase()} order${group.length > 1 ? 's' : ''}, areas ${sharedZones.join('+') || 'n/a'}, ${humanSla(sla)}`,
      });
    }
  }
  // Most urgent, densest waves first.
  return suggestions.sort((a, b) => b.orderIds.length - a.orderIds.length);
}

function countDistinctBins(orders: OrderPlanInfo[]): number {
  const bins = new Set<string>();
  for (const o of orders)
    for (const l of o.lineItems) if (l.allocatedBinId) bins.add(l.allocatedBinId);
  return bins.size;
}

function humanSla(sla: string | undefined): string {
  switch (sla) {
    case 'OVERDUE':
      return 'overdue';
    case 'SOON':
      return 'due within 2h';
    case 'TODAY':
      return 'due today';
    default:
      return 'future';
  }
}
