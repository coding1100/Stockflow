import type Redis from 'ioredis';
import { getRedis, getSubscriber } from './redis.js';
import {
  INVENTORY_STREAM,
  INVENTORY_CONSUMER_GROUP,
  realtimeChannel,
  type InventoryEvent,
  type RealtimeMessage,
  type RealtimeTopic,
} from './types.js';

/** Append an inventory event to the durable Redis Stream. */
export async function publishInventoryEvent(evt: InventoryEvent): Promise<void> {
  await getRedis().xadd(INVENTORY_STREAM, '*', 'data', JSON.stringify(evt));
}

/** Fire-and-forget realtime notification for the SSE fan-out. */
export async function publishRealtime(
  topic: RealtimeTopic,
  event: string,
  payload: unknown,
): Promise<void> {
  const msg: RealtimeMessage = { topic, event, payload, at: new Date().toISOString() };
  await getRedis().publish(realtimeChannel(topic), JSON.stringify(msg));
}

/**
 * Subscribe to a realtime topic. Returns an unsubscribe function. Used by the SSE
 * route handler to forward messages to connected browsers.
 */
export function subscribeRealtime(
  topic: RealtimeTopic,
  onMessage: (msg: RealtimeMessage) => void,
): () => void {
  const sub: Redis = getSubscriber();
  const channel = realtimeChannel(topic);
  const handler = (chan: string, raw: string) => {
    if (chan === channel) {
      try {
        onMessage(JSON.parse(raw) as RealtimeMessage);
      } catch {
        /* ignore malformed */
      }
    }
  };
  void sub.subscribe(channel);
  sub.on('message', handler);
  return () => {
    sub.off('message', handler);
    void sub.unsubscribe(channel);
  };
}

/** Ensure the consumer group exists (idempotent — ignores BUSYGROUP). */
export async function ensureInventoryGroup(): Promise<void> {
  try {
    await getRedis().xgroup('CREATE', INVENTORY_STREAM, INVENTORY_CONSUMER_GROUP, '$', 'MKSTREAM');
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
  }
}

export interface StreamEntry {
  id: string;
  event: InventoryEvent;
}

/**
 * Read a batch of new inventory events for a consumer in the group. Blocks up to
 * `blockMs` waiting for new entries. At-least-once delivery; caller must ack.
 */
export async function readInventoryEvents(
  consumer: string,
  count = 50,
  blockMs = 5000,
): Promise<StreamEntry[]> {
  const res = (await getRedis().xreadgroup(
    'GROUP',
    INVENTORY_CONSUMER_GROUP,
    consumer,
    'COUNT',
    count,
    'BLOCK',
    blockMs,
    'STREAMS',
    INVENTORY_STREAM,
    '>',
  )) as [string, [string, string[]][]][] | null;

  if (!res) return [];
  const entries: StreamEntry[] = [];
  for (const [, items] of res) {
    for (const [id, fields] of items) {
      const dataIdx = fields.indexOf('data');
      if (dataIdx >= 0 && fields[dataIdx + 1]) {
        entries.push({ id, event: JSON.parse(fields[dataIdx + 1]!) as InventoryEvent });
      }
    }
  }
  return entries;
}

export async function ackInventoryEvent(id: string): Promise<void> {
  await getRedis().xack(INVENTORY_STREAM, INVENTORY_CONSUMER_GROUP, id);
}
