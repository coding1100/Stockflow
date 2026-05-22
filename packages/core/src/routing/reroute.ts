import { optimizeRoute } from './optimize.js';
import type { OptimizeOptions, Route, Stop } from './types.js';

/**
 * Re-optimize the remaining route after a short pick reroutes the picker to an overflow
 * bin. Stops already completed (seq < currentSeq) are frozen; the new overflow stop is
 * appended to the unvisited set and the tail is re-solved from the picker's current
 * position. Keeps the picker moving without a full restart.
 */
export function insertRerouteStop(
  route: Route,
  currentSeq: number,
  overflowStop: Stop,
  options: OptimizeOptions,
): Route {
  const remaining = route.stops.filter((s) => s.seq > currentSeq);
  const fromStop = route.stops.find((s) => s.seq === currentSeq);
  const depot = fromStop ? { x: fromStop.x, y: fromStop.y } : options.depot;

  const resolved = optimizeRoute([...remaining, overflowStop], { ...options, depot, returnToDepot: false });

  // Stitch: keep done stops, renumber the re-solved tail after currentSeq.
  const done = route.stops.filter((s) => s.seq <= currentSeq);
  const tail = resolved.stops.map((s, i) => ({ ...s, seq: currentSeq + 1 + i }));
  return {
    ...route,
    stops: [...done, ...tail],
    totalDistance: route.totalDistance, // recomputed lazily by caller if needed
  };
}
