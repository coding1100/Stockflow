import type { TransactionType } from '@stockflow/db';
import { publishInventoryEvent, publishRealtime } from '@stockflow/events';
import type { Context } from '../context.js';

export interface RecordTxInput {
  type: TransactionType;
  skuId: string;
  binId: string | null;
  quantity: number;
  sourceId?: string;
  sourceType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persist a stock-affecting transaction (the source of truth) and publish it to the
 * Redis Stream for the materializer, then fan out a lightweight realtime notification
 * for live UI. The DB write is authoritative; the stream drives the <2s read-model
 * update. Returns the created transaction id.
 */
export async function recordTransaction(ctx: Context, input: RecordTxInput): Promise<string> {
  const user = ctx.user!;
  const tx = await ctx.db!.transaction.create({
    data: {
      tenantId: user.tenantId,
      warehouseId: user.warehouseId,
      type: input.type,
      skuId: input.skuId,
      binId: input.binId,
      quantity: input.quantity,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      userId: user.id,
      metadata: (input.metadata ?? {}) as object,
    },
  });

  await publishInventoryEvent({
    transactionId: tx.id,
    tenantId: user.tenantId,
    warehouseId: user.warehouseId,
    type: input.type,
    skuId: input.skuId,
    binId: input.binId,
    quantity: input.quantity,
    occurredAt: tx.occurredAt.toISOString(),
  });

  await publishRealtime('activity', `tx.${input.type.toLowerCase()}`, {
    transactionId: tx.id,
    type: input.type,
    skuId: input.skuId,
    quantity: input.quantity,
  });

  return tx.id;
}
