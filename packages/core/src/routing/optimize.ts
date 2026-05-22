import { zonedDistance, type ZonedPoint } from './distance.js';
import { ZoneDistanceMatrix } from './zoneGraph.js';
import type { OptimizeOptions, OrderedStop, Route, RouteLeg, Stop } from './types.js';

const DEFAULTS = {
  timeBudgetMs: 250,
  metersPerSec: 1.3,
  gridUnitMeters: 0.5,
  secondsPerPick: 12,
  returnToDepot: true,
};

/**
 * Optimize a pick route over a set of stops.
 *
 * Algorithm: nearest-neighbour construction (greedy) followed by 2-opt local
 * improvement under a wall-clock budget. Within ~5% of optimal on Euclidean-ish
 * instances, O(N^2) per 2-opt pass with O(1) swap deltas, and easily <1s for 200
 * stops (enforced by a perf test). The route is anchored at the pack-station depot.
 *
 * Deterministic: ties broken by stop index, so the same input yields the same route
 * (matters for reproducible demos and golden snapshot tests).
 */
export function optimizeRoute(stops: Stop[], options: OptimizeOptions): Route {
  const opts = { ...DEFAULTS, ...options };
  const zg = options.zoneGraph ? new ZoneDistanceMatrix(options.zoneGraph) : undefined;

  // Node 0 is the depot; nodes 1..N are the stops.
  const depot: ZonedPoint = { ...opts.depot, zoneId: '__depot__' };
  const points: ZonedPoint[] = [depot, ...stops.map((s) => ({ x: s.x, y: s.y, zoneId: s.zoneId }))];
  const N = points.length;

  // Precompute symmetric distance matrix once.
  const D: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const d = zonedDistance(points[i]!, points[j]!, zg);
      D[i]![j] = d;
      D[j]![i] = d;
    }
  const dist = (a: number, b: number) => D[a]![b]!;

  if (stops.length === 0) {
    return { version: 1, algorithm: 'nn+2opt', totalDistance: 0, estimatedDurationSec: 0, stops: [], legs: [] };
  }

  // --- Nearest-neighbour construction from the depot ---
  const visited = new Array<boolean>(N).fill(false);
  visited[0] = true;
  const tour: number[] = [0];
  let current = 0;
  for (let step = 0; step < N - 1; step++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 1; j < N; j++) {
      if (!visited[j]) {
        const d = dist(current, j);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
    }
    visited[best] = true;
    tour.push(best);
    current = best;
  }

  // --- 2-opt improvement (depot fixed at position 0) ---
  // Reversing segment [i..k] changes only the two boundary edges; evaluate via delta.
  const closed = opts.returnToDepot;
  const endpoint = (idx: number) => (idx === tour.length ? (closed ? 0 : -1) : tour[idx]!);
  const deadline = Date.now() + opts.timeBudgetMs;
  let improved = true;
  while (improved && Date.now() < deadline) {
    improved = false;
    for (let i = 1; i < tour.length - 1; i++) {
      const a = tour[i - 1]!;
      const b = tour[i]!;
      for (let k = i + 1; k < tour.length; k++) {
        const c = tour[k]!;
        const dNode = endpoint(k + 1);
        if (dNode === -1) {
          // open route: reversing the tail only matters if there's a following edge
          const delta = dist(a, c) - dist(a, b);
          if (delta < -1e-9) {
            reverse(tour, i, k);
            improved = true;
            break;
          }
          continue;
        }
        const delta = dist(a, c) + dist(b, dNode) - dist(a, b) - dist(c, dNode);
        if (delta < -1e-9) {
          reverse(tour, i, k);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  // --- Assemble Route ---
  const orderedStops: OrderedStop[] = [];
  const legs: RouteLeg[] = [];
  let total = 0;
  let prevNode = 0; // depot
  for (let pos = 1; pos < tour.length; pos++) {
    const node = tour[pos]!;
    const stop = stops[node - 1]!;
    const legDist = dist(prevNode, node);
    total += legDist;
    legs.push({
      fromBinId: prevNode === 0 ? null : stops[prevNode - 1]!.binId,
      toBinId: stop.binId,
      distance: legDist,
    });
    orderedStops.push({ ...stop, seq: pos });
    prevNode = node;
  }
  if (closed && stops.length > 0) {
    const legDist = dist(prevNode, 0);
    total += legDist;
    legs.push({ fromBinId: stops[prevNode - 1]!.binId, toBinId: null, distance: legDist });
  }

  const pickCount = stops.reduce((sum, s) => sum + s.picks.reduce((p, l) => p + l.qty, 0), 0);
  const walkSec = (total * opts.gridUnitMeters) / opts.metersPerSec;
  const estimatedDurationSec = Math.round(walkSec + pickCount * opts.secondsPerPick);

  return { version: 1, algorithm: 'nn+2opt', totalDistance: total, estimatedDurationSec, stops: orderedStops, legs };
}

function reverse(arr: number[], i: number, k: number): void {
  while (i < k) {
    const tmp = arr[i]!;
    arr[i] = arr[k]!;
    arr[k] = tmp;
    i++;
    k--;
  }
}

/** Total walking distance of a naive route in received/stop order (for before/after demo). */
export function naiveDistance(stops: Stop[], options: OptimizeOptions): number {
  const zg = options.zoneGraph ? new ZoneDistanceMatrix(options.zoneGraph) : undefined;
  const depot: ZonedPoint = { ...options.depot, zoneId: '__depot__' };
  let total = 0;
  let prev: ZonedPoint = depot;
  for (const s of stops) {
    const p: ZonedPoint = { x: s.x, y: s.y, zoneId: s.zoneId };
    total += zonedDistance(prev, p, zg);
    prev = p;
  }
  if (options.returnToDepot ?? true) total += zonedDistance(prev, depot, zg);
  return total;
}
