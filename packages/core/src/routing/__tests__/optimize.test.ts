import { describe, expect, it } from 'vitest';
import { optimizeRoute, naiveDistance } from '../optimize.js';
import type { Stop, ZoneNode } from '../types.js';

function makeStop(id: number, x: number, y: number, zoneId = 'Z'): Stop {
  return {
    binId: `bin-${id}`,
    binCode: `A-${id}`,
    zoneId,
    x,
    y,
    picks: [{ skuId: `sku-${id}`, skuCode: `S${id}`, name: `Item ${id}`, imageUrl: null, qty: 1, orderId: 'o1' }],
  };
}

/** Deterministic PRNG so generated instances are reproducible. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('optimizeRoute', () => {
  const depot = { x: 0, y: 0 };

  it('visits every stop exactly once', () => {
    const stops = [makeStop(1, 5, 5), makeStop(2, 1, 1), makeStop(3, 9, 2)];
    const route = optimizeRoute(stops, { depot });
    const visited = route.stops.map((s) => s.binId).sort();
    expect(visited).toEqual(['bin-1', 'bin-2', 'bin-3']);
    expect(route.stops).toHaveLength(3);
  });

  it('returns to the depot when returnToDepot is set', () => {
    const stops = [makeStop(1, 5, 5), makeStop(2, 1, 1)];
    const route = optimizeRoute(stops, { depot, returnToDepot: true });
    expect(route.legs.at(-1)?.toBinId).toBeNull();
  });

  it('handles the empty case', () => {
    const route = optimizeRoute([], { depot });
    expect(route.totalDistance).toBe(0);
    expect(route.stops).toHaveLength(0);
  });

  it('is at least as good as the naive received-order route', () => {
    const rng = mulberry32(42);
    for (let trial = 0; trial < 20; trial++) {
      const stops = Array.from({ length: 25 }, (_, i) =>
        makeStop(i, Math.floor(rng() * 100), Math.floor(rng() * 100)),
      );
      const naive = naiveDistance(stops, { depot });
      const optimized = optimizeRoute(stops, { depot }).totalDistance;
      expect(optimized).toBeLessThanOrEqual(naive + 1e-6);
    }
  });

  it('is deterministic for a fixed input', () => {
    const stops = [makeStop(1, 3, 7), makeStop(2, 8, 2), makeStop(3, 4, 4), makeStop(4, 9, 9)];
    const a = optimizeRoute(stops, { depot });
    const b = optimizeRoute(stops, { depot });
    expect(a.stops.map((s) => s.binId)).toEqual(b.stops.map((s) => s.binId));
    expect(a.totalDistance).toBe(b.totalDistance);
  });

  it('respects zone connector costs (does not cut through walls)', () => {
    // Two zones geometrically close but only reachable via a costly connector.
    const zoneGraph: ZoneNode[] = [
      { zoneId: 'A', centroid: { x: 0, y: 0 }, adjacency: { B: 1000 } },
      { zoneId: 'B', centroid: { x: 10, y: 0 }, adjacency: { A: 1000 } },
    ];
    const near = makeStop(1, 1, 0, 'A');
    const acrossWall = makeStop(2, 2, 0, 'B'); // geometrically nearest but behind a wall
    const sameZoneFar = makeStop(3, 8, 0, 'A');
    const route = optimizeRoute([near, acrossWall, sameZoneFar], {
      depot,
      zoneGraph,
      returnToDepot: false,
    });
    // The same-zone stop should be visited before crossing into zone B.
    const order = route.stops.map((s) => s.binId);
    expect(order.indexOf('bin-3')).toBeLessThan(order.indexOf('bin-2'));
  });

  it('PERF GATE: optimizes 200 stops across 8 zones in under 1s', () => {
    const rng = mulberry32(7);
    const zoneGraph: ZoneNode[] = Array.from({ length: 8 }, (_, z) => ({
      zoneId: `Z${z}`,
      centroid: { x: z * 50, y: 0 },
      adjacency: { [`Z${(z + 1) % 8}`]: 20, [`Z${(z + 7) % 8}`]: 20 },
    }));
    const stops = Array.from({ length: 200 }, (_, i) =>
      makeStop(i, Math.floor(rng() * 400), Math.floor(rng() * 200), `Z${i % 8}`),
    );
    const start = performance.now();
    const route = optimizeRoute(stops, { depot, zoneGraph, timeBudgetMs: 250 });
    const elapsed = performance.now() - start;
    expect(route.stops).toHaveLength(200);
    expect(elapsed).toBeLessThan(1000);
  });
});
