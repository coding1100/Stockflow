/** Domain events that flow through the Redis Streams event bus. */

export const INVENTORY_STREAM = 'inventory_events';
export const INVENTORY_CONSUMER_GROUP = 'materializers';

/** A stock-affecting event derived 1:1 from a persisted Transaction row. */
export interface InventoryEvent {
  /** Transaction UUID — the idempotency key for the materializer. */
  transactionId: string;
  tenantId: string;
  warehouseId: string;
  type: 'RECEIPT' | 'PICK' | 'COUNT' | 'ADJUSTMENT' | 'TRANSFER' | 'RETURN';
  skuId: string;
  binId: string | null;
  quantity: number;
  occurredAt: string; // ISO
}

/** Lightweight notifications fanned out over pub/sub to drive live UI (SSE). */
export type RealtimeTopic = 'inventory' | 'activity' | 'dashboard' | 'waves';

export interface RealtimeMessage {
  topic: RealtimeTopic;
  /** Free-form event name for the client, e.g. "pick.confirmed". */
  event: string;
  payload: unknown;
  at: string; // ISO
}

export const realtimeChannel = (topic: RealtimeTopic) => `rt:${topic}`;
