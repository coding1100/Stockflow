import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const dashboardRouter = router({
  /** Four headline KPI tiles with week-over-week deltas + 14-day sparklines (DB-01). */
  kpis: protectedProcedure.query(async ({ ctx }) => {
    const kpis = await ctx.db.dashboardKpi.findMany({ orderBy: { day: 'desc' }, take: 28 });
    const recent = kpis.slice(0, 7);
    const prior = kpis.slice(7, 14);

    const sum = (rows: typeof kpis, f: (r: (typeof kpis)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const accuracy = (rows: typeof kpis) => {
      const units = sum(rows, (r) => r.countUnits);
      return units ? 1 - sum(rows, (r) => r.countVarianceAbs) / units : 0.9;
    };
    const avgPick = (rows: typeof kpis) => {
      const samples = sum(rows, (r) => r.pickTimeSamples);
      return samples ? sum(rows, (r) => r.pickTimeSecSum) / samples : 0;
    };

    const picksToday = recent[0]?.picksCount ?? 0;
    const sparkline = [...kpis].reverse().slice(-14).map((r) => r.picksCount);

    const accNow = accuracy(recent);
    const accPrev = accuracy(prior);
    const pickNow = avgPick(recent);
    const pickPrev = avgPick(prior);

    return {
      stockAccuracy: { value: accNow, deltaPts: (accNow - accPrev) * 100, sparkline },
      avgPickTimeSec: { value: Math.round(pickNow), deltaPct: pickPrev ? ((pickNow - pickPrev) / pickPrev) * 100 : 0, sparkline },
      throughputToday: { value: picksToday, sparkline },
      laborHours: { value: Math.round((picksToday * 240) / 3600), sparkline },
    };
  }),

  throughput: protectedProcedure.input(z.object({ days: z.number().max(90).default(30) }).optional()).query(async ({ ctx, input }) => {
    const rows = await ctx.db.dashboardKpi.findMany({ orderBy: { day: 'desc' }, take: input?.days ?? 30 });
    return rows.reverse().map((r) => ({ day: dayKey(r.day), received: r.receiptsCount, picked: r.picksCount, shipped: r.shipmentsCount }));
  }),

  /** Live activity feed seeded with the most recent transactions (DB-02). */
  activity: protectedProcedure.input(z.object({ limit: z.number().max(50).default(25) }).optional()).query(async ({ ctx, input }) => {
    const txs = await ctx.db.transaction.findMany({ orderBy: { occurredAt: 'desc' }, take: input?.limit ?? 25, include: { sku: { select: { code: true, name: true } }, user: { select: { name: true } } } });
    return txs.map((t) => ({ id: t.id, type: t.type, sku: t.sku.code, name: t.sku.name, quantity: t.quantity, user: t.user?.name ?? 'system', at: t.occurredAt }));
  }),

  /** Needs-attention panel: low stock, overdue orders (DB-04). */
  needsAttention: protectedProcedure.query(async ({ ctx }) => {
    const lowStock = await ctx.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM skus s
      JOIN inventory_current ic ON ic.sku_id = s.id AND ic.bin_id = s.primary_bin_id
      WHERE s.tenant_id = ${ctx.user.tenantId}::uuid AND (ic.on_hand - ic.allocated - ic.reserved) <= s.min_stock`;
    const overdueOrders = await ctx.db.order.count({ where: { status: { in: ['PENDING', 'WAVED', 'PICKING'] }, slaDueAt: { lt: new Date() } } });
    const openWaves = await ctx.db.wave.count({ where: { status: { in: ['RELEASED', 'IN_PROGRESS'] } } });
    return { lowStockSkus: Number(lowStock[0]?.count ?? 0), overdueOrders, openWaves };
  }),
});
