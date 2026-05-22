import type { PickLine, Stop } from '../routing/types.js';

export interface BinMeta {
  binId: string;
  binCode: string;
  zoneId: string;
  x: number;
  y: number;
}

export interface WaveOrderLine {
  orderId: string;
  skuId: string;
  skuCode: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  binId: string;
  toteId?: string;
}

/**
 * Collapse all order lines in a wave into one Stop per bin. Aggregating demand at the bin
 * level is exactly why batch picking saves walking — multiple orders needing the same bin
 * become a single visit. Each pick keeps its orderId/toteId so units are tracked to totes.
 */
export function buildStops(lines: WaveOrderLine[], bins: Map<string, BinMeta>): Stop[] {
  const byBin = new Map<string, Stop>();
  for (const line of lines) {
    const meta = bins.get(line.binId);
    if (!meta) continue;
    let stop = byBin.get(line.binId);
    if (!stop) {
      stop = { binId: meta.binId, binCode: meta.binCode, zoneId: meta.zoneId, x: meta.x, y: meta.y, picks: [] };
      byBin.set(line.binId, stop);
    }
    const pick: PickLine = {
      skuId: line.skuId,
      skuCode: line.skuCode,
      name: line.name,
      imageUrl: line.imageUrl,
      qty: line.qty,
      orderId: line.orderId,
      toteId: line.toteId,
    };
    stop.picks.push(pick);
  }
  return [...byBin.values()];
}
