/**
 * Pure inventory projection: folds an immutable transaction event into the current
 * on-hand state. This is the heart of the event-sourced read model — the worker
 * materializer applies exactly this logic against Postgres, and tests apply it against
 * an in-memory map, so the rules live in one place.
 */

export type TransactionType = 'RECEIPT' | 'PICK' | 'COUNT' | 'ADJUSTMENT' | 'TRANSFER' | 'RETURN';

export interface InventoryEventInput {
  transactionId: string;
  type: TransactionType;
  skuId: string;
  binId: string | null;
  quantity: number; // signed: + into stock, - out of stock
}

export interface InventoryState {
  onHand: number;
  lastTransactionId: string | null;
}

export function emptyState(): InventoryState {
  return { onHand: 0, lastTransactionId: null };
}

/**
 * Apply one event. Idempotent: replaying an event whose id is already the last applied
 * id is a no-op, which makes offline double-sends and at-least-once stream delivery safe.
 */
export function applyEvent(state: InventoryState, evt: InventoryEventInput): InventoryState {
  if (state.lastTransactionId === evt.transactionId) return state;
  return {
    onHand: state.onHand + evt.quantity,
    lastTransactionId: evt.transactionId,
  };
}

/** Available to sell = on-hand minus what is already committed to channels/orders. */
export function availableToSell(onHand: number, allocated: number, reserved: number): number {
  return onHand - allocated - reserved;
}
