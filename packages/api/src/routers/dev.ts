import { z } from 'zod';
import { publishRealtime } from '@stockflow/events';
import { protectedProcedure, router } from '../trpc.js';

/**
 * Dev-only helpers that stand in for the ERP integration (out of demo scope). injectOrder
 * drops a fresh PENDING order into the queue; the worker's order-drip job calls this on a
 * timer so the queue and activity feed feel live during the demo.
 */
export const devRouter = router({
  injectOrder: protectedProcedure
    .input(z.object({ channel: z.enum(['STORE', 'ECOM', 'MARKETPLACE', 'WHOLESALE']).default('ECOM'), lines: z.number().min(1).max(5).default(2) }))
    .mutation(async ({ ctx, input }) => {
      // Pick a few in-stock SKUs to reference.
      const skus = await ctx.db.sku.findMany({ take: 200, orderBy: { code: 'asc' }, include: { inventory: true } });
      const inStock = skus.filter((s) => (s.inventory[0]?.onHand ?? 0) > 5);
      const chosen = Array.from({ length: input.lines }, () => inStock[Math.floor(Math.random() * inStock.length)]).filter(Boolean);
      const order = await ctx.db.order.create({
        data: {
          tenantId: ctx.user.tenantId,
          warehouseId: ctx.user.warehouseId,
          externalId: `WEB-DRIP-${Date.now()}`,
          channel: input.channel,
          slaDueAt: new Date(Date.now() + 2 * 3_600_000),
          status: 'PENDING',
          lineItems: chosen.map((s) => ({ skuId: s!.id, quantity: 1, allocatedBinId: s!.primaryBinId })) as object,
        },
      });
      await publishRealtime('activity', 'order.injected', { orderId: order.id, externalId: order.externalId, channel: order.channel });
      return order;
    }),

  users: protectedProcedure.query(({ ctx }) => ctx.db.user.findMany({ select: { id: true, name: true, role: true } })),
});
