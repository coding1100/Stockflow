import type { OrderForPlanning, OrderPlanInfo, SlaBucket } from './types.js';

export function slaBucket(slaDueAt: Date, now: Date): SlaBucket {
  const ms = slaDueAt.getTime() - now.getTime();
  const hour = 3_600_000;
  if (ms < 0) return 'OVERDUE';
  if (ms <= 2 * hour) return 'SOON';
  if (ms <= 24 * hour) return 'TODAY';
  return 'FUTURE';
}

/**
 * Enrich an order with the derived fields the queue and wave planner need:
 * which zones it touches (from each line's allocated bin), unit/line counts, and the
 * SLA urgency bucket. `binToZone` maps allocated bin id -> zone id.
 */
export function planOrder(
  order: OrderForPlanning,
  binToZone: Map<string, string>,
  now: Date,
): OrderPlanInfo {
  const zones = new Set<string>();
  let unitCount = 0;
  for (const line of order.lineItems) {
    unitCount += line.quantity;
    if (line.allocatedBinId) {
      const zone = binToZone.get(line.allocatedBinId);
      if (zone) zones.add(zone);
    }
  }
  return {
    ...order,
    slaBucket: slaBucket(order.slaDueAt, now),
    zonesTouched: [...zones].sort(),
    unitCount,
    lineCount: order.lineItems.length,
  };
}
