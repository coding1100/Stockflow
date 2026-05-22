import type { ZoneNode } from './types.js';

/**
 * All-pairs shortest path between zones (Floyd–Warshall). Warehouses have only a few
 * dozen zones, so the O(Z^3) precompute is microseconds and lets inter-zone distance
 * lookups be O(1) inside the hot distance function.
 */
export class ZoneDistanceMatrix {
  private readonly index = new Map<string, number>();
  private readonly dist: number[][];

  constructor(nodes: ZoneNode[]) {
    nodes.forEach((n, i) => this.index.set(n.zoneId, i));
    const N = nodes.length;
    const d: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(Infinity));
    for (let i = 0; i < N; i++) d[i]![i] = 0;
    for (const n of nodes) {
      const i = this.index.get(n.zoneId)!;
      for (const [adjId, cost] of Object.entries(n.adjacency)) {
        const j = this.index.get(adjId);
        if (j !== undefined) d[i]![j] = Math.min(d[i]![j]!, cost);
      }
    }
    for (let k = 0; k < N; k++)
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const through = d[i]![k]! + d[k]![j]!;
          if (through < d[i]![j]!) d[i]![j] = through;
        }
    this.dist = d;
  }

  /** Connector cost between two zones; 0 if same zone, Infinity if disconnected. */
  between(zoneA: string, zoneB: string): number {
    if (zoneA === zoneB) return 0;
    const i = this.index.get(zoneA);
    const j = this.index.get(zoneB);
    if (i === undefined || j === undefined) return 0; // unknown zones: fall back to raw geometry
    return this.dist[i]![j]!;
  }
}
