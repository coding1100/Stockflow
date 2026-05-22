export type VelocityTier = 'A' | 'B' | 'C';

export interface SkuPickVolume {
  skuId: string;
  rolling30dPick: number;
}

export interface VelocityResult {
  skuId: string;
  rolling30dPick: number;
  tier: VelocityTier;
}

/**
 * Classify SKUs into A/B/C tiers by rolling pick volume using Pareto cumulative share:
 * the fastest movers that together account for ~80% of pick volume are A, the next ~15%
 * are B, the long tail is C. This mirrors how slotting decisions are actually made
 * (fast movers near the pack station) rather than fixed count thresholds.
 */
export function classifyVelocity(
  volumes: SkuPickVolume[],
  thresholds = { a: 0.8, b: 0.95 },
): VelocityResult[] {
  const sorted = [...volumes].sort((x, y) => y.rolling30dPick - x.rolling30dPick || x.skuId.localeCompare(y.skuId));
  const total = sorted.reduce((sum, v) => sum + v.rolling30dPick, 0);
  if (total === 0) return sorted.map((v) => ({ ...v, tier: 'C' as const }));

  let cumulative = 0;
  return sorted.map((v) => {
    cumulative += v.rolling30dPick;
    const share = cumulative / total;
    const tier: VelocityTier = share <= thresholds.a ? 'A' : share <= thresholds.b ? 'B' : 'C';
    return { skuId: v.skuId, rolling30dPick: v.rolling30dPick, tier };
  });
}
