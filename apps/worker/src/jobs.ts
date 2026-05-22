import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { prisma, DEMO_TENANT_ID, DEMO_WAREHOUSE_ID } from '@stockflow/db';
import { inventory as inv } from '@stockflow/core';
import { publishRealtime } from '@stockflow/events';
import { logger } from '@stockflow/config/logger';

const log = logger.child({ component: 'jobs' });

function connection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6380');
  return { host: url.hostname, port: Number(url.port || 6379) };
}

export const JOBS_QUEUE = 'stockflow-jobs';

/**
 * Recompute A/B/C velocity tiers from rolling 30-day pick volume (PRD: nightly @02:00).
 * Exposed as a repeatable job and runnable on demand for the demo.
 */
async function recomputeVelocity(): Promise<void> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const grouped = await prisma.transaction.groupBy({
    by: ['skuId'],
    where: { type: 'PICK', occurredAt: { gte: since } },
    _sum: { quantity: true },
  });
  const volumes = grouped.map((g) => ({ skuId: g.skuId, rolling30dPick: Math.abs(g._sum.quantity ?? 0) }));
  const classified = inv.classifyVelocity(volumes);
  for (const c of classified) {
    await prisma.velocityClassification.upsert({
      where: { skuId: c.skuId },
      update: { rolling30dPick: c.rolling30dPick, tier: c.tier, computedAt: new Date() },
      create: { skuId: c.skuId, tenantId: DEMO_TENANT_ID, rolling30dPick: c.rolling30dPick, tier: c.tier },
    });
    await prisma.sku.update({ where: { id: c.skuId }, data: { velocityTier: c.tier } });
  }
  log.info({ count: classified.length }, 'velocity recomputed');
}

/** Inject a fresh ecom order so the demo queue/feed feel alive. */
async function dripOrder(): Promise<void> {
  const skus = await prisma.sku.findMany({ where: { tenantId: DEMO_TENANT_ID }, take: 150, include: { inventory: true } });
  const inStock = skus.filter((s) => (s.inventory[0]?.onHand ?? 0) > 5);
  if (inStock.length === 0) return;
  const lines = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => inStock[Math.floor(Math.random() * inStock.length)]!);
  const order = await prisma.order.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      warehouseId: DEMO_WAREHOUSE_ID,
      externalId: `WEB-DRIP-${Date.now()}`,
      channel: 'ECOM',
      slaDueAt: new Date(Date.now() + 2 * 3_600_000),
      status: 'PENDING',
      lineItems: lines.map((s) => ({ skuId: s.id, quantity: 1, allocatedBinId: s.primaryBinId })) as object,
    },
  });
  await publishRealtime('activity', 'order.injected', { orderId: order.id, externalId: order.externalId, channel: 'ECOM' });
}

export function startJobs(): { queue: Queue; worker: Worker } {
  const conn = connection();
  const queue = new Queue(JOBS_QUEUE, { connection: conn });

  const worker = new Worker(
    JOBS_QUEUE,
    async (job) => {
      if (job.name === 'velocity') return recomputeVelocity();
      if (job.name === 'order-drip' && process.env.DEMO_ORDER_DRIP === 'on') return dripOrder();
    },
    { connection: conn },
  );
  worker.on('failed', (job, err) => log.error({ jobName: job?.name, err }, 'job failed'));

  // Schedule repeatables (idempotent).
  void queue.add('velocity', {}, { repeat: { pattern: '0 2 * * *' }, jobId: 'velocity-nightly' });
  if (process.env.DEMO_ORDER_DRIP === 'on') {
    void queue.add('order-drip', {}, { repeat: { every: 20_000 }, jobId: 'order-drip' });
  }
  log.info('jobs scheduled');
  return { queue, worker };
}
