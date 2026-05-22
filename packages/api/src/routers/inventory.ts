import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { inventory as inv } from '@stockflow/core';
import { publishRealtime } from '@stockflow/events';
import { protectedProcedure, router } from '../trpc.js';
import { recordTransaction } from '../services/events.js';

const tierEnum = z.enum(['A', 'B', 'C']);

export const inventoryRouter = router({
  /** SKU search + filter (IN-01, IN-02). Returns available-to-sell per SKU. */
  searchSkus: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        tier: tierEnum.optional(),
        category: z.string().optional(),
        lowStock: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(25),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let lowStockIds: string[] | undefined;
      if (input.lowStock) {
        const rows = await ctx.prisma.$queryRaw<{ id: string }[]>`
          SELECT s.id FROM skus s
          JOIN inventory_current ic ON ic.sku_id = s.id AND ic.bin_id = s.primary_bin_id
          WHERE s.tenant_id = ${ctx.user.tenantId}::uuid
            AND (ic.on_hand - ic.allocated - ic.reserved) <= s.min_stock`;
        lowStockIds = rows.map((r) => r.id);
        if (lowStockIds.length === 0) return { items: [], nextCursor: undefined };
      }

      const skus = await ctx.db.sku.findMany({
        where: {
          ...(input.query
            ? { OR: [{ code: { contains: input.query, mode: 'insensitive' } }, { name: { contains: input.query, mode: 'insensitive' } }] }
            : {}),
          ...(input.tier ? { velocityTier: input.tier } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(lowStockIds ? { id: { in: lowStockIds } } : {}),
        },
        include: { inventory: true, primaryBin: { include: { zone: true } } },
        orderBy: { code: 'asc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const hasMore = skus.length > input.limit;
      const page = hasMore ? skus.slice(0, input.limit) : skus;
      return {
        items: page.map((s) => {
          const ic = s.inventory.find((r) => r.binId === s.primaryBinId) ?? s.inventory[0];
          const onHand = ic?.onHand ?? 0;
          const allocated = ic?.allocated ?? 0;
          const reserved = ic?.reserved ?? 0;
          const available = inv.availableToSell(onHand, allocated, reserved);
          return {
            id: s.id,
            code: s.code,
            name: s.name,
            category: s.category,
            brand: s.brand,
            tier: s.velocityTier,
            minStock: s.minStock,
            onHand,
            allocated,
            reserved,
            available,
            lowStock: available <= s.minStock,
            binCode: s.primaryBin?.code ?? null,
            zone: s.primaryBin?.zone.code ?? null,
            imageUrl: s.imageUrl,
          };
        }),
        nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
      };
    }),

  /** Full SKU detail with per-bin inventory + channel allocations (IN-01). */
  getSku: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const sku = await ctx.db.sku.findFirst({
      where: { id: input.id },
      include: {
        inventory: { include: { bin: { include: { zone: true } } } },
        primaryBin: { include: { zone: true } },
        velocity: true,
        allocations: true,
      },
    });
    if (!sku) throw new TRPCError({ code: 'NOT_FOUND' });
    const rollup = sku.inventory.reduce(
      (acc, r) => ({ onHand: acc.onHand + r.onHand, allocated: acc.allocated + r.allocated, reserved: acc.reserved + r.reserved }),
      { onHand: 0, allocated: 0, reserved: 0 },
    );
    return {
      ...sku,
      available: inv.availableToSell(rollup.onHand, rollup.allocated, rollup.reserved),
      rollup,
    };
  }),

  /** Transaction history for a SKU (IN-08), newest first. */
  getSkuTransactions: protectedProcedure
    .input(z.object({ skuId: z.string(), limit: z.number().max(100).default(30) }))
    .query(({ ctx, input }) =>
      ctx.db.transaction.findMany({
        where: { skuId: input.skuId },
        orderBy: { occurredAt: 'desc' },
        take: input.limit,
        include: { user: { select: { name: true } } },
      }),
    ),

  /** Variance history: count/adjustment events with root-cause source links (IN-08). */
  getSkuVariance: protectedProcedure.input(z.object({ skuId: z.string() })).query(({ ctx, input }) =>
    ctx.db.transaction.findMany({
      where: { skuId: input.skuId, type: { in: ['COUNT', 'ADJUSTMENT'] } },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    }),
  ),

  listCategories: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.sku.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } });
    return rows.map((r) => r.category);
  }),

  /** Set per-SKU min/max thresholds (IN-06). */
  setThresholds: protectedProcedure
    .input(z.object({ skuId: z.string(), minStock: z.number().min(0), maxStock: z.number().min(0) }))
    .mutation(({ ctx, input }) =>
      ctx.db.sku.update({ where: { id: input.skuId }, data: { minStock: input.minStock, maxStock: input.maxStock } }),
    ),

  /**
   * Reserve units for a channel, preventing overselling (IN-07). Runs inside a
   * transaction with a row lock so two concurrent orders cannot both grab the last unit.
   */
  reserve: protectedProcedure
    .input(z.object({ skuId: z.string(), channel: z.enum(['STORE', 'ECOM', 'MARKETPLACE', 'WHOLESALE']), qty: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ on_hand: number; allocated: number; reserved: number }[]>`
          SELECT on_hand, allocated, reserved FROM inventory_current
          WHERE sku_id = ${input.skuId}::uuid AND tenant_id = ${ctx.user.tenantId}::uuid
          FOR UPDATE`;
        const cur = rows[0] ?? { on_hand: 0, allocated: 0, reserved: 0 };
        const decision = inv.evaluateReservation({
          onHand: cur.on_hand,
          allocated: cur.allocated,
          reserved: cur.reserved,
          requestedQty: input.qty,
        });
        if (!decision.ok) {
          return { ok: false as const, available: decision.available, reason: decision.reason };
        }
        await tx.$executeRaw`
          UPDATE inventory_current SET reserved = reserved + ${input.qty}
          WHERE sku_id = ${input.skuId}::uuid AND tenant_id = ${ctx.user.tenantId}::uuid`;
        await tx.channelAllocation.create({
          data: { tenantId: ctx.user.tenantId, skuId: input.skuId, channel: input.channel, reservedQty: input.qty },
        });
        return { ok: true as const, available: decision.available - input.qty, granted: input.qty };
      });
    }),

  // --- Cycle counts (IN-03, IN-04) ---

  createCycleCount: protectedProcedure
    .input(z.object({ scope: z.enum(['ZONE', 'TIER']), scopeValue: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Expand scope into bins -> expected lines from the current read model.
      const skus = await ctx.db.sku.findMany({
        where: input.scope === 'TIER' ? { velocityTier: input.scopeValue as 'A' | 'B' | 'C' } : { primaryBin: { zone: { code: input.scopeValue } } },
        include: { inventory: true },
        // A focused, walkable count (rolling cycle counts are small by design).
        take: 8,
      });
      const count = await ctx.db.cycleCount.create({
        data: {
          tenantId: ctx.user.tenantId,
          warehouseId: ctx.user.warehouseId,
          scope: input.scope,
          scopeValue: input.scopeValue,
          status: 'PENDING',
          assigneeId: ctx.user.id,
          lines: {
            create: skus
              .filter((s) => s.primaryBinId)
              .map((s) => ({
                binId: s.primaryBinId!,
                skuId: s.id,
                expectedQty: s.inventory.find((r) => r.binId === s.primaryBinId)?.onHand ?? 0,
              })),
          },
        },
        include: { lines: true },
      });
      return count;
    }),

  listCycleCounts: protectedProcedure.query(({ ctx }) =>
    ctx.db.cycleCount.findMany({ orderBy: { createdAt: 'desc' }, take: 25, include: { lines: true, assignee: { select: { name: true } } } }),
  ),

  getCycleCount: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const cc = await ctx.db.cycleCount.findFirst({
      where: { id: input.id },
      include: { lines: { include: { } } },
    });
    if (!cc) throw new TRPCError({ code: 'NOT_FOUND' });
    // Attach bin + sku codes for the mobile UI.
    const bins = await ctx.db.bin.findMany({ where: { id: { in: cc.lines.map((l) => l.binId) } }, select: { id: true, code: true } });
    const skus = await ctx.db.sku.findMany({ where: { id: { in: cc.lines.map((l) => l.skuId) } }, select: { id: true, code: true, name: true, barcode: true } });
    const binMap = new Map(bins.map((b) => [b.id, b.code]));
    const skuMap = new Map(skus.map((s) => [s.id, s]));
    return {
      ...cc,
      lines: cc.lines.map((l) => ({ ...l, binCode: binMap.get(l.binId), sku: skuMap.get(l.skuId) })),
    };
  }),

  /**
   * Post counted quantities (IN-04). Variances become ADJUSTMENT transactions (with
   * reason + prior/new qty), flow through the event bus, and bump the dashboard
   * accuracy KPI — so a count visibly moves the headline metric in the demo.
   */
  postCycleCount: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        lines: z.array(z.object({ lineId: z.string(), countedQty: z.number().min(0), reasonCode: z.string().optional() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cc = await ctx.db.cycleCount.findFirst({ where: { id: input.id }, include: { lines: true } });
      if (!cc) throw new TRPCError({ code: 'NOT_FOUND' });

      let totalAbsVariance = 0;
      let totalExpected = 0;
      for (const submitted of input.lines) {
        const line = cc.lines.find((l) => l.id === submitted.lineId);
        if (!line) continue;
        const variance = submitted.countedQty - line.expectedQty;
        totalExpected += line.expectedQty;
        totalAbsVariance += Math.abs(variance);
        await ctx.db.cycleCountLine.update({
          where: { id: line.id },
          data: { countedQty: submitted.countedQty, variance, reasonCode: submitted.reasonCode, status: variance === 0 ? 'COUNTED' : 'VARIANCE_ACCEPTED' },
        });
        if (variance !== 0) {
          await recordTransaction(ctx, {
            type: 'ADJUSTMENT',
            skuId: line.skuId,
            binId: line.binId,
            quantity: variance,
            sourceId: cc.id,
            sourceType: 'CycleCount',
            metadata: { reasonCode: submitted.reasonCode, priorQty: line.expectedQty, newQty: submitted.countedQty },
          });
        }
      }
      await ctx.db.cycleCount.update({ where: { id: cc.id }, data: { status: 'COMPLETED', completedAt: new Date() } });

      // Update today's accuracy KPI and notify the dashboard.
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await ctx.db.dashboardKpi.upsert({
        where: { tenantId_warehouseId_day: { tenantId: ctx.user.tenantId, warehouseId: ctx.user.warehouseId, day: today } },
        update: { countVarianceAbs: { increment: totalAbsVariance }, countUnits: { increment: totalExpected } },
        create: { tenantId: ctx.user.tenantId, warehouseId: ctx.user.warehouseId, day: today, countVarianceAbs: totalAbsVariance, countUnits: totalExpected },
      });
      await publishRealtime('dashboard', 'count.posted', { cycleCountId: cc.id, accuracy: totalExpected ? 1 - totalAbsVariance / totalExpected : 1 });

      return { binsCounted: new Set(cc.lines.map((l) => l.binId)).size, totalAbsVariance, accuracy: totalExpected ? 1 - totalAbsVariance / totalExpected : 1 };
    }),
});
