import { randomUUID } from 'node:crypto';

export interface SeedZone {
  id: string;
  code: string;
  name: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  adjacency: { zoneCode: string; cost: number }[];
}

export interface SeedBin {
  id: string;
  zoneId: string;
  zoneCode: string;
  code: string;
  capacityUnits: number;
  x: number;
  y: number;
  restrictions: Record<string, boolean>;
}

const ZONE_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const ZONE_NAMES: Record<string, string> = {
  A: 'Fast Pick (near pack)',
  B: 'Fast Pick 2',
  C: 'General 1',
  D: 'General 2',
  E: 'General 3',
  F: 'General 4',
  G: 'Bulk / Overflow',
  H: 'Hazmat / Special',
};

const ZONE_SPACING_X = 60;
const AISLES_PER_ZONE = 6;
const SHELVES_PER_AISLE = 13;
const AISLE_SPACING = 9;
const SHELF_SPACING = 8;

/**
 * Build a visual warehouse grid: 8 zones laid left-to-right, zone A adjacent to the
 * pack-station depot at (0,0). Each zone is a block of aisles (columns) × shelves
 * (rows). Adjacency forms a chain with cross-aisle connector costs so the routing
 * zone-graph routes between zones realistically. ~624 bins total.
 */
export function buildLayout(): { zones: SeedZone[]; bins: SeedBin[] } {
  const zones: SeedZone[] = [];
  const bins: SeedBin[] = [];

  ZONE_CODES.forEach((code, zi) => {
    const startX = 10 + zi * ZONE_SPACING_X;
    const zoneId = randomUUID();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let aisle = 0; aisle < AISLES_PER_ZONE; aisle++) {
      for (let shelf = 0; shelf < SHELVES_PER_AISLE; shelf++) {
        const x = startX + aisle * AISLE_SPACING;
        const y = 10 + shelf * SHELF_SPACING;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        bins.push({
          id: randomUUID(),
          zoneId,
          zoneCode: code,
          code: `${code}-${String(aisle + 1).padStart(2, '0')}-${String(shelf + 1).padStart(2, '0')}`,
          capacityUnits: 120,
          x,
          y,
          restrictions: code === 'H' ? { hazmat: true } : {},
        });
      }
    }

    const adjacency: SeedZone['adjacency'] = [];
    if (zi > 0) adjacency.push({ zoneCode: ZONE_CODES[zi - 1]!, cost: ZONE_SPACING_X });
    if (zi < ZONE_CODES.length - 1) adjacency.push({ zoneCode: ZONE_CODES[zi + 1]!, cost: ZONE_SPACING_X });

    zones.push({
      id: zoneId,
      code,
      name: ZONE_NAMES[code]!,
      minX,
      minY,
      maxX,
      maxY,
      adjacency,
    });
  });

  return { zones, bins };
}

export { ZONE_CODES };
