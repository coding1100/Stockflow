import { describe, expect, it } from 'vitest';
import { planOrder, slaBucket } from '../orderZones.js';
import { suggestWaves } from '../waveSuggest.js';
import { buildStops } from '../buildStops.js';
import type { OrderForPlanning, OrderPlanInfo } from '../types.js';

const now = new Date('2026-05-22T09:00:00Z');

describe('orderZones', () => {
  const binToZone = new Map([
    ['bin-a1', 'A'],
    ['bin-a2', 'A'],
    ['bin-b1', 'B'],
  ]);

  it('derives zones touched, unit and line counts', () => {
    const order: OrderForPlanning = {
      id: 'o1',
      channel: 'ECOM',
      slaDueAt: new Date('2026-05-22T10:00:00Z'),
      lineItems: [
        { skuId: 's1', quantity: 2, allocatedBinId: 'bin-a1' },
        { skuId: 's2', quantity: 1, allocatedBinId: 'bin-b1' },
      ],
    };
    const info = planOrder(order, binToZone, now);
    expect(info.zonesTouched).toEqual(['A', 'B']);
    expect(info.unitCount).toBe(3);
    expect(info.lineCount).toBe(2);
    expect(info.slaBucket).toBe('SOON');
  });

  it('buckets SLA correctly', () => {
    expect(slaBucket(new Date('2026-05-22T08:00:00Z'), now)).toBe('OVERDUE');
    expect(slaBucket(new Date('2026-05-22T10:30:00Z'), now)).toBe('SOON');
    expect(slaBucket(new Date('2026-05-22T20:00:00Z'), now)).toBe('TODAY');
    expect(slaBucket(new Date('2026-05-24T09:00:00Z'), now)).toBe('FUTURE');
  });
});

describe('waveSuggest', () => {
  function order(id: string, zones: string[]): OrderPlanInfo {
    return {
      id,
      channel: 'ECOM',
      slaDueAt: new Date('2026-05-22T10:00:00Z'),
      lineItems: zones.map((z, i) => ({ skuId: `${id}-${i}`, quantity: 1, allocatedBinId: `bin-${z}-${id}-${i}` })),
      slaBucket: 'SOON',
      zonesTouched: zones,
      unitCount: zones.length,
      lineCount: zones.length,
    };
  }

  it('groups zone-overlapping orders into the same wave', () => {
    const orders = [order('o1', ['A']), order('o2', ['A']), order('o3', ['D'])];
    const suggestions = suggestWaves(orders, { maxOrdersPerWave: 5 });
    const waveWithO1 = suggestions.find((s) => s.orderIds.includes('o1'))!;
    expect(waveWithO1.orderIds).toContain('o2');
    expect(waveWithO1.orderIds).not.toContain('o3');
  });

  it('respects maxOrdersPerWave', () => {
    const orders = Array.from({ length: 10 }, (_, i) => order(`o${i}`, ['A']));
    const suggestions = suggestWaves(orders, { maxOrdersPerWave: 3 });
    expect(Math.max(...suggestions.map((s) => s.orderIds.length))).toBeLessThanOrEqual(3);
  });

  it('separates different channels', () => {
    const a = order('o1', ['A']);
    const b = { ...order('o2', ['A']), channel: 'WHOLESALE' as const };
    const suggestions = suggestWaves([a, b], { maxOrdersPerWave: 5 });
    const wave = suggestions.find((s) => s.orderIds.includes('o1'))!;
    expect(wave.orderIds).not.toContain('o2');
  });
});

describe('buildStops', () => {
  it('collapses multiple orders needing the same bin into one stop', () => {
    const bins = new Map([['bin-1', { binId: 'bin-1', binCode: 'A-1', zoneId: 'A', x: 1, y: 1 }]]);
    const stops = buildStops(
      [
        { orderId: 'o1', skuId: 's1', skuCode: 'S1', name: 'X', imageUrl: null, qty: 1, binId: 'bin-1' },
        { orderId: 'o2', skuId: 's1', skuCode: 'S1', name: 'X', imageUrl: null, qty: 2, binId: 'bin-1' },
      ],
      bins,
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]!.picks).toHaveLength(2);
  });
});
