'use client';

import { openDB, type IDBPDatabase } from 'idb';
import { vanillaTrpc } from '@/lib/trpc/vanilla';

/**
 * Offline action queue. Each pick/short/undo is appended to an IndexedDB "outbox" and
 * applied to local UI state immediately (the pick screen never blocks on the network).
 * On reconnect the queue is replayed in order; every action carries a uuid `scanId`, so
 * the server's idempotency guard makes replays safe — no double counts.
 */
export interface OutboxAction {
  scanId: string;
  kind: 'pick' | 'short' | 'undo';
  payload: Record<string, unknown>;
  queuedAt: string;
}

const DB_NAME = 'stockflow-offline';
const STORE = 'outbox';

async function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'scanId' });
    },
  });
}

export async function enqueue(action: OutboxAction): Promise<void> {
  const d = await db();
  await d.put(STORE, action);
}

export async function queueDepth(): Promise<number> {
  const d = await db();
  return d.count(STORE);
}

async function remove(scanId: string): Promise<void> {
  const d = await db();
  await d.delete(STORE, scanId);
}

/** Replay all queued actions oldest-first. Returns how many synced. */
export async function flushOutbox(): Promise<number> {
  const d = await db();
  const all = (await d.getAll(STORE)) as OutboxAction[];
  all.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  let synced = 0;
  for (const action of all) {
    try {
      if (action.kind === 'pick') await vanillaTrpc.picking.confirmPick.mutate(action.payload as never);
      else if (action.kind === 'short') await vanillaTrpc.picking.reportException.mutate(action.payload as never);
      else if (action.kind === 'undo') await vanillaTrpc.picking.undoPick.mutate(action.payload as never);
      await remove(action.scanId);
      synced += 1;
    } catch {
      // Leave in queue for the next flush (network still flaky, or a conflict to retry).
      break;
    }
  }
  return synced;
}
