/** Pure routing types — no Prisma, no I/O, so the optimizer is trivially testable. */

export interface Coord {
  x: number;
  y: number;
}

export interface PickLine {
  skuId: string;
  skuCode: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  orderId: string;
  toteId?: string;
}

/** One physical location to visit, aggregating all picks needed at that bin. */
export interface Stop {
  binId: string;
  binCode: string;
  zoneId: string;
  x: number;
  y: number;
  picks: PickLine[];
}

/** Zone adjacency for the connector graph (cross-aisle traversal costs). */
export interface ZoneNode {
  zoneId: string;
  centroid: Coord;
  /** zoneId -> connector cost to an adjacent zone. */
  adjacency: Record<string, number>;
}

export interface RouteLeg {
  fromBinId: string | null; // null = depot
  toBinId: string | null; // null = depot (final return)
  distance: number;
}

export interface OrderedStop extends Stop {
  seq: number;
}

export interface Route {
  version: 1;
  algorithm: string;
  totalDistance: number;
  estimatedDurationSec: number;
  stops: OrderedStop[];
  legs: RouteLeg[];
}

export interface OptimizeOptions {
  depot: Coord;
  zoneGraph?: ZoneNode[];
  /** Wall-clock budget for 2-opt improvement (ms). */
  timeBudgetMs?: number;
  /** Walk speed + handling, for duration estimate. */
  metersPerSec?: number;
  gridUnitMeters?: number;
  secondsPerPick?: number;
  /** Deterministic tie-breaking for reproducible demo routes. */
  returnToDepot?: boolean;
}
