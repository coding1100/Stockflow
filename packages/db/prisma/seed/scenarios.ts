export interface Scenario {
  name: string;
  salt: number;
  openOrders: number;
  lowStockSkus: number;
  oversellSkus: number;
  historyDays: number;
  /** Multiplier on daily pick volume — "peak" runs hot. */
  volumeMultiplier: number;
  heroWaves: number;
}

export const SCENARIOS: Record<string, Scenario> = {
  'demo-default': {
    name: 'demo-default',
    salt: 0,
    openOrders: 120,
    lowStockSkus: 35,
    oversellSkus: 3,
    historyDays: 75,
    volumeMultiplier: 1,
    heroWaves: 2,
  },
  peak: {
    name: 'peak',
    salt: 100,
    openOrders: 260,
    lowStockSkus: 70,
    oversellSkus: 6,
    historyDays: 75,
    volumeMultiplier: 2.2,
    heroWaves: 2,
  },
  clean: {
    name: 'clean',
    salt: 200,
    openOrders: 60,
    lowStockSkus: 0,
    oversellSkus: 0,
    historyDays: 60,
    volumeMultiplier: 1,
    heroWaves: 1,
  },
};

export function resolveScenario(): Scenario {
  const key = process.env.SEED_SCENARIO ?? 'demo-default';
  return SCENARIOS[key] ?? SCENARIOS['demo-default']!;
}
