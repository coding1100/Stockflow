import type { Coord } from './types.js';
import type { ZoneDistanceMatrix } from './zoneGraph.js';

/** Manhattan distance — warehouse aisles mean you can't cut diagonally through racking. */
export function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export interface ZonedPoint extends Coord {
  zoneId: string;
}

/**
 * Distance between two bins. Within a zone it's pure Manhattan; across zones the path
 * must use cross-aisle connectors, so we add the precomputed zone-graph cost. This is
 * what makes the visualized route hug aisles instead of teleporting through shelving.
 */
export function zonedDistance(a: ZonedPoint, b: ZonedPoint, zg?: ZoneDistanceMatrix): number {
  const base = manhattan(a, b);
  if (!zg || a.zoneId === b.zoneId) return base;
  return base + zg.between(a.zoneId, b.zoneId);
}
