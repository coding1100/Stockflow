import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { routing, picking as pk } from '@stockflow/core';
import { publishRealtime } from '@stockflow/events';
import { protectedProcedure, pickerProcedure, opsLeadProcedure, router } from '../trpc.js';
import { recordTransaction } from '../services/events.js';

type OrderLine = { skuId: string; quantity: number; allocatedBinId: string | null };

/** Load the persisted route for a wave (throws if not optimized yet). */
async function loadRoute(db: NonNullable<Parameters<typeof recordTransaction>[0]['db']>, waveId: string) {
  const wave = await db.wave.findFirst({ where: { id: waveId } });
  if (!wave) throw new TRPCError({ code: 'NOT_FOUND', message: 'Wave not found' });
  return wave;
}

async function buildZoneGraph(db: NonNullable<Parameters<typeof recordTransaction>[0]['db']>): Promise<routing.ZoneNode[]> {
  const zones = await db.zone.findMany();
  return zones.map((z) => ({
    zoneId: z.code,
    centroid: { x: (z.minX + z.maxX) / 2, y: (z.minY + z.maxY) / 2 },
    adjacency: Object.fromEntries((z.adjacency as { zoneCode: string; cost: number }[]).map((a) => [a.zoneCode, a.cost])),
  }));
}

export const pickingRouter = router({
  /** Warehouse zones, shelf positions and depot — everything the route map draws. */
  zones: protectedProcedure.query(async ({ ctx }) => {
    const zones = await ctx.db.zone.findMany({ orderBy: { code: 'asc' } });
    const bins = await ctx.db.bin.findMany({ select: { x: true, y: true }, orderBy: { code: 'asc' } });
    return {
      depot: { x: 0, y: 0 },
      zones: zones.map((z) => ({ code: z.code, name: z.name, minX: z.minX, minY: z.minY, maxX: z.maxX, maxY: z.maxY })),
      bins,
    };
  }),

  // --- Order queue (PK) ---
  ordersList: protectedProcedure
    .input(
      z.object({
        status: z.enum(['PENDING', 'WAVED', 'PICKING', 'PICKED']).optional(),
        channel: z.enum(['STORE', 'ECOM', 'MARKETPLACE', 'WHOLESALE']).optional(),
        limit: z.number().max(200).default(80),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orders = await ctx.db.order.findMany({
        where: { status: input.status ?? 'PENDING', ...(input.channel ? { channel: input.channel } : {}) },
        orderBy: { slaDueAt: 'asc' },
        take: input.limit,
      });
      const binIds = [...new Set(orders.flatMap((o) => (o.lineItems as OrderLine[]).map((l) => l.allocatedBinId).filter(Boolean) as string[]))];
      const bins = await ctx.db.bin.findMany({ where: { id: { in: binIds } }, include: { zone: true } });
      const binToZone = new Map(bins.map((b) => [b.id, b.zone.code]));
      const now = new Date();
      return orders.map((o) => {
        const info = pk.planOrder(
          { id: o.id, channel: o.channel, slaDueAt: o.slaDueAt, lineItems: o.lineItems as OrderLine[] },
          binToZone,
          now,
        );
        return { id: o.id, externalId: o.externalId, channel: o.channel, status: o.status, slaDueAt: o.slaDueAt, slaBucket: info.slaBucket, zonesTouched: info.zonesTouched, unitCount: info.unitCount, lineCount: info.lineCount };
      });
    }),

  // --- Wave suggest + build (PK-01, PK-02) ---
  suggestWaves: opsLeadProcedure
    .input(z.object({ maxOrdersPerWave: z.number().min(2).max(20).default(6) }))
    .query(async ({ ctx, input }) => {
      const orders = await ctx.db.order.findMany({ where: { status: 'PENDING' }, take: 120 });
      const binIds = [...new Set(orders.flatMap((o) => (o.lineItems as OrderLine[]).map((l) => l.allocatedBinId).filter(Boolean) as string[]))];
      const bins = await ctx.db.bin.findMany({ where: { id: { in: binIds } }, include: { zone: true } });
      const binToZone = new Map(bins.map((b) => [b.id, b.zone.code]));
      const now = new Date();
      const planned = orders.map((o) => pk.planOrder({ id: o.id, channel: o.channel, slaDueAt: o.slaDueAt, lineItems: o.lineItems as OrderLine[] }, binToZone, now));
      return pk.suggestWaves(planned, { maxOrdersPerWave: input.maxOrdersPerWave }).slice(0, 8);
    }),

  createWave: opsLeadProcedure
    .input(z.object({ orderIds: z.array(z.string()).min(1), mode: z.enum(['SINGLE', 'BATCH']).default('SINGLE'), pickerId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const orders = await ctx.db.order.findMany({ where: { id: { in: input.orderIds }, status: 'PENDING' } });
      if (orders.length !== input.orderIds.length) throw new TRPCError({ code: 'CONFLICT', message: 'Some orders are no longer pending' });
      const count = await ctx.db.wave.count();
      const wave = await ctx.db.wave.create({
        data: {
          tenantId: ctx.user.tenantId,
          warehouseId: ctx.user.warehouseId,
          name: `W-${300 + count}`,
          status: 'DRAFT',
          mode: input.mode,
          pickerId: input.pickerId,
          orderIds: input.orderIds,
          toteMap: input.mode === 'BATCH' ? pk.assignTotes(input.orderIds) : {},
        },
      });
      await ctx.db.order.updateMany({ where: { id: { in: input.orderIds } }, data: { status: 'WAVED', waveId: wave.id } });
      await publishRealtime('waves', 'wave.created', { waveId: wave.id, name: wave.name });
      return wave;
    }),

  listWaves: protectedProcedure.input(z.object({ status: z.enum(['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED']).optional() }).optional()).query(({ ctx, input }) =>
    ctx.db.wave.findMany({ where: input?.status ? { status: input.status } : {}, orderBy: { createdAt: 'desc' }, take: 30, include: { picker: { select: { name: true } } } }),
  ),

  getWave: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const wave = await ctx.db.wave.findFirst({ where: { id: input.id }, include: { picker: { select: { name: true } }, orders: true } });
    if (!wave) throw new TRPCError({ code: 'NOT_FOUND' });
    return wave;
  }),

  /** Route optimization (PK-03): flatten lines -> per-bin stops -> NN+2-opt. */
  optimizeWave: opsLeadProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const wave = await loadRoute(ctx.db, input.id);
    const orders = await ctx.db.order.findMany({ where: { id: { in: wave.orderIds } } });
    const skuIds = [...new Set(orders.flatMap((o) => (o.lineItems as OrderLine[]).map((l) => l.skuId)))];
    const skus = await ctx.db.sku.findMany({ where: { id: { in: skuIds } }, include: { primaryBin: { include: { zone: true } } } });
    const skuMap = new Map(skus.map((s) => [s.id, s]));
    const binMeta = new Map<string, pk.BinMeta>();
    const lines: pk.WaveOrderLine[] = [];
    const toteMap = wave.toteMap as Record<string, string>;
    for (const o of orders) {
      for (const li of o.lineItems as OrderLine[]) {
        const s = skuMap.get(li.skuId);
        if (!s?.primaryBin || !li.allocatedBinId) continue;
        binMeta.set(s.primaryBin.id, { binId: s.primaryBin.id, binCode: s.primaryBin.code, zoneId: s.primaryBin.zone.code, x: s.primaryBin.x, y: s.primaryBin.y });
        lines.push({ orderId: o.id, skuId: s.id, skuCode: s.code, name: s.name, imageUrl: s.imageUrl, qty: li.quantity, binId: li.allocatedBinId, toteId: toteMap[o.id] });
      }
    }
    const stops = pk.buildStops(lines, binMeta);
    const zoneGraph = await buildZoneGraph(ctx.db);
    const route = routing.optimizeRoute(stops, { depot: { x: 0, y: 0 }, zoneGraph, returnToDepot: true });
    await ctx.db.wave.update({ where: { id: wave.id }, data: { optimizedRoute: route as object, estimatedDurationSec: route.estimatedDurationSec } });
    await publishRealtime('waves', 'wave.optimized', { waveId: wave.id, totalDistance: route.totalDistance });
    return route;
  }),

  assignPicker: opsLeadProcedure.input(z.object({ id: z.string(), pickerId: z.string() })).mutation(({ ctx, input }) =>
    ctx.db.wave.update({ where: { id: input.id }, data: { pickerId: input.pickerId } }),
  ),

  releaseWave: opsLeadProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const wave = await loadRoute(ctx.db, input.id);
    if (!wave.optimizedRoute) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Optimize the wave before releasing' });
    const updated = await ctx.db.wave.update({ where: { id: wave.id }, data: { status: 'RELEASED' } });
    await publishRealtime('waves', 'wave.released', { waveId: wave.id });
    return updated;
  }),

  // --- Mobile pick session (PK-04, PK-05) ---
  startWave: pickerProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const wave = await ctx.db.wave.update({ where: { id: input.id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
    await ctx.db.order.updateMany({ where: { id: { in: wave.orderIds } }, data: { status: 'PICKING' } });
    await publishRealtime('waves', 'wave.started', { waveId: wave.id });
    return wave; // includes optimizedRoute for offline caching
  }),

  /** Confirm a single pick. Idempotent on scanId so offline replays never double-count. */
  confirmPick: pickerProcedure
    .input(
      z.object({
        waveId: z.string(),
        scanId: z.string().uuid(),
        stopSeq: z.number(),
        binScan: z.string(),
        itemScan: z.string(),
        qty: z.number().min(1),
        toteId: z.string().optional(),
        occurredAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Idempotency: a transaction already carrying this scanId means it's a replay.
      const existing = await ctx.db.transaction.findFirst({ where: { metadata: { path: ['scanId'], equals: input.scanId } } });
      if (existing) return { ok: true as const, deduped: true };

      const wave = await loadRoute(ctx.db, input.waveId);
      const route = wave.optimizedRoute as unknown as routing.Route | null;
      const stop = route?.stops.find((s) => s.seq === input.stopSeq);
      if (!stop) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown stop' });
      if (stop.binCode !== input.binScan) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Wrong bin scanned' });

      // Match item by SKU code or barcode among the picks at this stop.
      const skuIds = stop.picks.map((p) => p.skuId);
      const skus = await ctx.db.sku.findMany({ where: { id: { in: skuIds } }, select: { id: true, code: true, barcode: true } });
      const matched = skus.find((s) => s.code === input.itemScan || s.barcode === input.itemScan);
      if (!matched) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Item not expected at this bin' });
      const pickLine = stop.picks.find((p) => p.skuId === matched.id)!;

      await recordTransaction(ctx, {
        type: 'PICK',
        skuId: matched.id,
        binId: stop.binId,
        quantity: -input.qty,
        sourceId: input.waveId,
        sourceType: 'Wave',
        metadata: { scanId: input.scanId, orderId: pickLine.orderId, toteId: input.toteId ?? pickLine.toteId, stopSeq: input.stopSeq },
      });
      // Bump today's pick KPI.
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await ctx.db.dashboardKpi.upsert({
        where: { tenantId_warehouseId_day: { tenantId: ctx.user.tenantId, warehouseId: ctx.user.warehouseId, day: today } },
        update: { picksCount: { increment: 1 } },
        create: { tenantId: ctx.user.tenantId, warehouseId: ctx.user.warehouseId, day: today, picksCount: 1 },
      });
      await publishRealtime('dashboard', 'pick.confirmed', { waveId: input.waveId, stopSeq: input.stopSeq });
      return { ok: true as const, deduped: false, totalStops: route?.stops.length ?? 0 };
    }),

  /** Report a short / damaged / wrong-location pick (PK-06). */
  reportException: pickerProcedure
    .input(z.object({ waveId: z.string(), scanId: z.string().uuid(), stopSeq: z.number(), skuId: z.string(), reason: z.enum(['SHORT', 'DAMAGED', 'WRONG_LOCATION']), qtyFound: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      if (input.qtyFound > 0) {
        await recordTransaction(ctx, { type: 'PICK', skuId: input.skuId, binId: null, quantity: -input.qtyFound, sourceId: input.waveId, sourceType: 'Wave', metadata: { scanId: input.scanId, partial: true } });
      }
      await publishRealtime('activity', 'pick.exception', { waveId: input.waveId, skuId: input.skuId, reason: input.reason });
      await publishRealtime('dashboard', 'pick.exception', { waveId: input.waveId, reason: input.reason });
      return { ok: true, escalated: true };
    }),

  /** Undo a just-confirmed pick (wrong bin realised). Writes a compensating event. */
  undoPick: pickerProcedure.input(z.object({ scanId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const orig = await ctx.db.transaction.findFirst({ where: { metadata: { path: ['scanId'], equals: input.scanId } } });
    if (!orig) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nothing to undo' });
    await recordTransaction(ctx, { type: 'PICK', skuId: orig.skuId, binId: orig.binId, quantity: -orig.quantity, sourceType: 'Undo', metadata: { undoOf: orig.id } });
    return { ok: true };
  }),

  completeWave: pickerProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const wave = await loadRoute(ctx.db, input.id);
    const actualDurationSec = wave.startedAt ? Math.round((Date.now() - wave.startedAt.getTime()) / 1000) : null;
    const updated = await ctx.db.wave.update({ where: { id: wave.id }, data: { status: 'COMPLETED', completedAt: new Date(), actualDurationSec } });
    await ctx.db.order.updateMany({ where: { id: { in: wave.orderIds } }, data: { status: 'PICKED' } });
    await publishRealtime('waves', 'wave.completed', { waveId: wave.id });
    await publishRealtime('dashboard', 'wave.completed', { waveId: wave.id, actualDurationSec });
    return updated;
  }),

  liveProgress: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const wave = await loadRoute(ctx.db, input.id);
    const route = wave.optimizedRoute as unknown as routing.Route | null;
    const totalStops = route?.stops.length ?? 0;
    const picks = await ctx.db.transaction.count({ where: { sourceType: 'Wave', sourceId: wave.id, type: 'PICK' } });
    return { waveId: wave.id, status: wave.status, totalStops, stopsDone: picks, estimatedDurationSec: wave.estimatedDurationSec, startedAt: wave.startedAt };
  }),

  /** Per-picker performance (PK-08), manager-only. */
  performanceByPicker: opsLeadProcedure.query(async ({ ctx }) => {
    const waves = await ctx.db.wave.findMany({ where: { status: 'COMPLETED', pickerId: { not: null } }, include: { picker: { select: { id: true, name: true } } } });
    const byPicker = new Map<string, { name: string; waves: number; totalActual: number; totalEstimate: number }>();
    for (const w of waves) {
      if (!w.picker) continue;
      const acc = byPicker.get(w.picker.id) ?? { name: w.picker.name, waves: 0, totalActual: 0, totalEstimate: 0 };
      acc.waves += 1;
      acc.totalActual += w.actualDurationSec ?? 0;
      acc.totalEstimate += w.estimatedDurationSec ?? 0;
      byPicker.set(w.picker.id, acc);
    }
    return [...byPicker.entries()].map(([id, a]) => ({
      pickerId: id,
      name: a.name,
      waves: a.waves,
      avgActualSec: a.waves ? Math.round(a.totalActual / a.waves) : 0,
      avgEstimateSec: a.waves ? Math.round(a.totalEstimate / a.waves) : 0,
      vsEstimatePct: a.totalEstimate ? Math.round(((a.totalActual - a.totalEstimate) / a.totalEstimate) * 100) : 0,
    }));
  }),
});
