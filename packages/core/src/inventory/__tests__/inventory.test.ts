import { describe, expect, it } from 'vitest';
import { applyEvent, availableToSell, emptyState } from '../projection.js';
import { evaluateReservation } from '../allocation.js';
import { classifyVelocity } from '../velocity.js';
import { summarizeCount } from '../cycleCount.js';

describe('inventory projection', () => {
  it('accumulates signed quantities', () => {
    let s = emptyState();
    s = applyEvent(s, { transactionId: 't1', type: 'RECEIPT', skuId: 'a', binId: 'b', quantity: 10 });
    s = applyEvent(s, { transactionId: 't2', type: 'PICK', skuId: 'a', binId: 'b', quantity: -3 });
    expect(s.onHand).toBe(7);
    expect(s.lastTransactionId).toBe('t2');
  });

  it('is idempotent on replayed transaction id', () => {
    let s = emptyState();
    const evt = { transactionId: 't1', type: 'RECEIPT' as const, skuId: 'a', binId: 'b', quantity: 5 };
    s = applyEvent(s, evt);
    s = applyEvent(s, evt); // replay (offline double-send / at-least-once delivery)
    expect(s.onHand).toBe(5);
  });

  it('computes available to sell', () => {
    expect(availableToSell(100, 20, 5)).toBe(75);
  });
});

describe('overselling prevention', () => {
  it('grants when enough is available', () => {
    const r = evaluateReservation({ onHand: 10, allocated: 2, reserved: 1, requestedQty: 5 });
    expect(r.ok).toBe(true);
    expect(r.granted).toBe(5);
  });

  it('blocks when it would oversell the last units', () => {
    const r = evaluateReservation({ onHand: 10, allocated: 8, reserved: 1, requestedQty: 2 });
    expect(r.ok).toBe(false);
    expect(r.granted).toBe(0);
    expect(r.reason).toBe('INSUFFICIENT_AVAILABLE');
    expect(r.available).toBe(1);
  });
});

describe('velocity classification', () => {
  it('assigns A to the fast movers carrying ~80% of volume', () => {
    const result = classifyVelocity([
      { skuId: 'fast', rolling30dPick: 800 },
      { skuId: 'mid', rolling30dPick: 150 },
      { skuId: 'slow', rolling30dPick: 50 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.skuId, r.tier]));
    expect(byId.fast).toBe('A');
    expect(byId.slow).toBe('C');
  });

  it('defaults all to C when there is no pick history', () => {
    const result = classifyVelocity([{ skuId: 'x', rolling30dPick: 0 }]);
    expect(result[0]!.tier).toBe('C');
  });
});

describe('cycle count summary', () => {
  it('computes variance and accuracy', () => {
    const summary = summarizeCount([
      { binId: 'b1', skuId: 's1', expectedQty: 10, countedQty: 8 }, // -2 shrinkage
      { binId: 'b2', skuId: 's2', expectedQty: 5, countedQty: 5 },
    ]);
    expect(summary.totalAbsVariance).toBe(2);
    expect(summary.binsCounted).toBe(2);
    expect(summary.accuracy).toBeCloseTo(1 - 2 / 15, 5);
    expect(summary.lines[0]!.hasVariance).toBe(true);
  });
});
