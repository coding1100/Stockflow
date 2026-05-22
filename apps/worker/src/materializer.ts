import { prisma } from '@stockflow/db';
import {
  ackInventoryEvent,
  ensureInventoryGroup,
  publishRealtime,
  readInventoryEvents,
  type InventoryEvent,
} from '@stockflow/events';
import { logger } from '@stockflow/config/logger';

const log = logger.child({ component: 'materializer' });
const CONSUMER = `materializer-${process.pid}`;

/**
 * Consume the inventory event stream and project each event into the inventory_current
 * read model within ~1-2s. Idempotent: an event whose id already equals the row's
 * lastTransactionId is skipped, so at-least-once delivery and offline replays are safe.
 * After projecting, fans out a realtime invalidation (SSE) and a min/max alert if the
 * SKU has dropped to its reorder point.
 */
export async function runMaterializer(signal: AbortSignal): Promise<void> {
  await ensureInventoryGroup();
  log.info('materializer started');

  while (!signal.aborted) {
    const entries = await readInventoryEvents(CONSUMER, 50, 2000);
    for (const { id, event } of entries) {
      try {
        await project(event);
        await ackInventoryEvent(id);
      } catch (err) {
        log.error({ err, streamId: id }, 'projection failed; will retry from PEL');
      }
    }
  }
}

async function project(event: InventoryEvent): Promise<void> {
  if (!event.binId) return;

  await prisma.$transaction(async (tx) => {
    const row = await tx.inventoryCurrent.findUnique({ where: { skuId_binId: { skuId: event.skuId, binId: event.binId! } } });
    if (row?.lastTransactionId === event.transactionId) return; // idempotent replay

    await tx.inventoryCurrent.upsert({
      where: { skuId_binId: { skuId: event.skuId, binId: event.binId! } },
      update: { onHand: { increment: event.quantity }, lastTransactionId: event.transactionId },
      create: {
        tenantId: event.tenantId,
        warehouseId: event.warehouseId,
        skuId: event.skuId,
        binId: event.binId,
        onHand: event.quantity,
        lastTransactionId: event.transactionId,
      },
    });
    await tx.bin.update({ where: { id: event.binId! }, data: { currentUnits: { increment: event.quantity } } });
  });

  // Realtime invalidation for any open Inventory/Dashboard clients.
  await publishRealtime('inventory', 'inventory.updated', { skuId: event.skuId, binId: event.binId });

  // Min/max alert (IN-06): notify when available has reached the reorder point.
  const sku = await prisma.sku.findUnique({ where: { id: event.skuId }, select: { minStock: true, code: true } });
  const ic = await prisma.inventoryCurrent.findUnique({ where: { skuId_binId: { skuId: event.skuId, binId: event.binId! } } });
  if (sku && ic && ic.onHand - ic.allocated - ic.reserved <= sku.minStock) {
    await publishRealtime('activity', 'stock.low', { skuId: event.skuId, code: sku.code });
  }
}
