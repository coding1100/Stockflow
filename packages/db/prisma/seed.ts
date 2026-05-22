import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '@stockflow/config/password';
import { routing, picking as pick } from '@stockflow/core';
import {
  DEMO_TENANT_ID,
  DEMO_WAREHOUSE_ID,
  DEMO_TENANT_NAME,
  DEMO_WAREHOUSE_CODE,
} from '../src/constants.js';
import { resetRng, NOW, intBetween, chance, pick as choose } from './seed/rng.js';
import { buildLayout } from './seed/layout.js';
import { buildCatalog, type SeedSku } from './seed/catalog.js';
import { resolveScenario } from './seed/scenarios.js';

const prisma = new PrismaClient();
const T = { tenantId: DEMO_TENANT_ID, warehouseId: DEMO_WAREHOUSE_ID };

const CHANNELS = ['ECOM', 'ECOM', 'ECOM', 'STORE', 'MARKETPLACE', 'WHOLESALE'] as const;

async function main() {
  const scenario = resolveScenario();
  const { rng } = resetRng(scenario.salt);
  console.log(`\n🌱 Seeding scenario "${scenario.name}" (deterministic)…`);

  await truncateAll();

  // --- Tenant + warehouse ---
  await prisma.tenant.create({ data: { id: DEMO_TENANT_ID, name: DEMO_TENANT_NAME } });
  await prisma.warehouse.create({
    data: { id: DEMO_WAREHOUSE_ID, tenantId: DEMO_TENANT_ID, code: DEMO_WAREHOUSE_CODE, name: 'Central DC', depotX: 0, depotY: 0 },
  });

  // --- Users (one per role; shared demo password) ---
  const pw = hashPassword('demo1234');
  await prisma.user.createMany({
    data: [
      { tenantId: DEMO_TENANT_ID, email: 'ops@stockflow.com', name: 'Olivia Ops', role: 'OPERATIONS_LEAD', passwordHash: pw },
      { tenantId: DEMO_TENANT_ID, email: 'clerk@stockflow.com', name: 'Carl Clerk', role: 'RECEIVING_CLERK', passwordHash: pw },
      { tenantId: DEMO_TENANT_ID, email: 'picker@stockflow.com', name: 'Priya Picker', role: 'PICKER', passwordHash: pw },
      { tenantId: DEMO_TENANT_ID, email: 'picker2@stockflow.com', name: 'Pete Picker', role: 'PICKER', passwordHash: pw },
      { tenantId: DEMO_TENANT_ID, email: 'vendor@stockflow.com', name: 'Vera Vendor', role: 'VENDOR_MANAGER', passwordHash: pw },
      { tenantId: DEMO_TENANT_ID, email: 'admin@stockflow.com', name: 'Ada Admin', role: 'ADMIN', passwordHash: pw },
    ],
  });
  const pickerUser = await prisma.user.findFirstOrThrow({ where: { role: 'PICKER' } });

  // --- Layout: zones + bins ---
  const { zones, bins } = buildLayout();
  await prisma.zone.createMany({
    data: zones.map((z) => ({
      id: z.id,
      ...T,
      code: z.code,
      name: z.name,
      minX: z.minX,
      minY: z.minY,
      maxX: z.maxX,
      maxY: z.maxY,
      adjacency: z.adjacency as unknown as Prisma.InputJsonValue,
    })),
  });
  await batchedCreate('bin', bins.map((b) => ({
    id: b.id,
    ...T,
    zoneId: b.zoneId,
    code: b.code,
    capacityUnits: b.capacityUnits,
    currentUnits: 0,
    restrictions: b.restrictions as Prisma.InputJsonValue,
    x: b.x,
    y: b.y,
  })));
  console.log(`  ✓ ${zones.length} zones, ${bins.length} bins`);

  // --- Catalog ---
  const skus = buildCatalog(rng, bins);
  await batchedCreate('sku', skus.map((s) => ({
    id: s.id,
    tenantId: DEMO_TENANT_ID,
    code: s.code,
    name: s.name,
    description: s.description,
    category: s.category,
    brand: s.brand,
    barcode: s.barcode,
    weightG: s.weightG,
    dimensionsMm: s.dimensionsMm as Prisma.InputJsonValue,
    hazmat: s.hazmat,
    minStock: s.minStock,
    maxStock: s.maxStock,
    velocityTier: s.velocityTier,
    primaryBinId: s.primaryBinId,
    imageUrl: s.imageUrl,
  })));
  console.log(`  ✓ ${skus.length} SKUs`);

  // --- Inventory levels with engineered anomalies (story.ts logic inline) ---
  const onHand = new Map<string, number>();
  const lowStockSet = new Set<string>();
  const oversellSet = new Set<string>();
  skus.forEach((s, i) => {
    let qty = intBetween(rng, Math.floor((s.minStock + s.maxStock) / 2), s.maxStock);
    if (i < scenario.lowStockSkus) {
      qty = intBetween(rng, 0, Math.max(1, s.minStock - 1)); // at/below reorder point
      lowStockSet.add(s.id);
    }
    onHand.set(s.id, qty);
  });
  // Dedicated overselling SKUs: near-zero available with an open order on them.
  const oversellSkus = skus.slice(scenario.lowStockSkus, scenario.lowStockSkus + scenario.oversellSkus);
  oversellSkus.forEach((s) => {
    onHand.set(s.id, 2);
    oversellSet.add(s.id);
  });

  // --- Orders (some zone-clustered for nice wave suggestions) ---
  const allocated = new Map<string, number>();
  const orderRows: Prisma.OrderCreateManyInput[] = [];
  const skusByZone = groupByZone(skus);
  for (let i = 0; i < scenario.openOrders; i++) {
    const channel = choose(rng, CHANNELS);
    const clustered = chance(rng, 0.6);
    const lineCount = intBetween(rng, 1, channel === 'WHOLESALE' ? 6 : 4);
    const zone = clustered ? choose(rng, ['A', 'B', 'C', 'D', 'E']) : null;
    const lineItems: { skuId: string; quantity: number; allocatedBinId: string }[] = [];
    for (let l = 0; l < lineCount; l++) {
      const pool = zone ? (skusByZone.get(zone) ?? skus) : skus;
      const s = weightedSku(rng, pool);
      const qty = intBetween(rng, 1, 4);
      lineItems.push({ skuId: s.id, quantity: qty, allocatedBinId: s.primaryBinId });
      allocated.set(s.id, (allocated.get(s.id) ?? 0) + qty);
    }
    orderRows.push({
      ...T,
      externalId: `WEB-${100000 + i}`,
      channel,
      slaDueAt: slaFor(rng, i, scenario.openOrders),
      status: 'PENDING',
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
    });
  }
  // Guarantee each oversell SKU has an open order beyond available.
  oversellSkus.forEach((s, idx) => {
    allocated.set(s.id, (allocated.get(s.id) ?? 0) + 5);
    orderRows.push({
      ...T,
      externalId: `WEB-OVS-${idx}`,
      channel: 'ECOM',
      slaDueAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      status: 'PENDING',
      lineItems: [{ skuId: s.id, quantity: 5, allocatedBinId: s.primaryBinId }] as unknown as Prisma.InputJsonValue,
    });
  });
  await batchedCreate('order', orderRows);
  console.log(`  ✓ ${orderRows.length} open orders`);

  // --- InventoryCurrent read model (SKU-level rollup at primary bin) ---
  const invRows: Prisma.InventoryCurrentCreateManyInput[] = skus.map((s) => {
    const oh = onHand.get(s.id) ?? 0;
    const alloc = Math.min(allocated.get(s.id) ?? 0, oversellSet.has(s.id) ? 999 : oh); // oversell rows intentionally exceed
    const reserved = oversellSet.has(s.id) ? Math.max(0, oh - 1) : 0;
    return { ...T, skuId: s.id, binId: s.primaryBinId, onHand: oh, allocated: oversellSet.has(s.id) ? alloc : Math.min(alloc, oh), reserved };
  });
  await batchedCreate('inventoryCurrent', invRows);

  // Update bin.currentUnits to match.
  const binUnits = new Map<string, number>();
  skus.forEach((s) => binUnits.set(s.primaryBinId, (binUnits.get(s.primaryBinId) ?? 0) + (onHand.get(s.id) ?? 0)));
  await prisma.$transaction(
    [...binUnits.entries()].map(([binId, units]) =>
      prisma.bin.update({ where: { id: binId }, data: { currentUnits: units } }),
    ),
  );
  console.log(`  ✓ inventory_current for ${invRows.length} SKUs (${lowStockSet.size} low-stock, ${oversellSet.size} oversell)`);

  // --- Historical transactions + velocity + dashboard KPIs ---
  await seedHistory(skus, scenario, pickerUser.id, rng);

  // --- Hero waves (pre-optimized) ---
  await seedHeroWaves(skus, zones, bins, scenario, pickerUser.id);

  console.log('\n✅ Seed complete.\n');
}

// ---------------------------------------------------------------------------

async function seedHistory(skus: SeedSku[], scenario: ReturnType<typeof resolveScenario>, userId: string, rng: ReturnType<typeof resetRng>['rng']) {
  const txRows: Prisma.TransactionCreateManyInput[] = [];
  const rolling30 = new Map<string, number>();
  const kpiByDay = new Map<string, { picks: number; pickTimeSum: number; samples: number; receipts: number }>();

  for (let d = scenario.historyDays; d >= 1; d--) {
    const day = new Date(NOW.getTime() - d * 86_400_000);
    const dayKey = day.toISOString().slice(0, 10);
    const weekendFactor = [0, 6].includes(day.getUTCDay()) ? 0.5 : 1;
    const peakFactor = d < 10 ? 1.4 : 1; // ramp into "now"
    let dayPicks = 0;

    for (const s of skus) {
      const pPick = (s.popularity / 100) * 0.25 * weekendFactor * peakFactor * scenario.volumeMultiplier;
      if (chance(rng, Math.min(0.95, pPick))) {
        const qty = intBetween(rng, 1, 3);
        txRows.push({
          ...T,
          type: 'PICK',
          skuId: s.id,
          binId: s.primaryBinId,
          quantity: -qty,
          sourceType: 'Order',
          userId,
          occurredAt: new Date(day.getTime() + intBetween(rng, 8, 17) * 3_600_000),
          recordedAt: day,
          metadata: {},
        });
        dayPicks += 1;
        if (d <= 30) rolling30.set(s.id, (rolling30.get(s.id) ?? 0) + qty);
      }
      // Occasional receipts to keep stock plausible.
      if (chance(rng, 0.01)) {
        txRows.push({
          ...T,
          type: 'RECEIPT',
          skuId: s.id,
          binId: s.primaryBinId,
          quantity: intBetween(rng, 20, 120),
          sourceType: 'Asn',
          userId,
          occurredAt: new Date(day.getTime() + intBetween(rng, 6, 12) * 3_600_000),
          recordedAt: day,
          metadata: {},
        });
      }
    }
    kpiByDay.set(dayKey, {
      picks: dayPicks,
      pickTimeSum: dayPicks * intBetween(rng, 180, 300),
      samples: Math.ceil(dayPicks / 6),
      receipts: intBetween(rng, 2, 8),
    });
  }
  await batchedCreate('transaction', txRows);

  // Velocity classification from rolling 30-day pick volume.
  const volumes = skus.map((s) => ({ skuId: s.id, rolling30dPick: rolling30.get(s.id) ?? 0 }));
  const classified = (await import('@stockflow/core')).inventory.classifyVelocity(volumes);
  await batchedCreate('velocityClassification', classified.map((c) => ({
    skuId: c.skuId,
    tenantId: DEMO_TENANT_ID,
    rolling30dPick: c.rolling30dPick,
    tier: c.tier,
  })));

  // Dashboard KPI aggregates per day.
  await batchedCreate('dashboardKpi', [...kpiByDay.entries()].map(([dayKey, k]) => ({
    ...T,
    day: new Date(dayKey),
    picksCount: k.picks,
    receiptsCount: k.receipts,
    shipmentsCount: Math.floor(k.picks * 0.9),
    pickTimeSecSum: k.pickTimeSum,
    pickTimeSamples: k.samples,
    countVarianceAbs: intBetween(rng, 0, 8),
    countUnits: intBetween(rng, 200, 600),
  })));
  console.log(`  ✓ ${txRows.length} historical transactions, velocity tiers, ${kpiByDay.size} daily KPI rows`);
}

async function seedHeroWaves(skus: SeedSku[], zones: ReturnType<typeof buildLayout>['zones'], bins: ReturnType<typeof buildLayout>['bins'], scenario: ReturnType<typeof resolveScenario>, pickerId: string) {
  const binMeta = new Map(bins.map((b) => [b.id, { binId: b.id, binCode: b.code, zoneId: b.zoneCode, x: b.x, y: b.y }]));
  const zoneGraph: routing.ZoneNode[] = zones.map((z) => ({
    zoneId: z.code,
    centroid: { x: (z.minX + z.maxX) / 2, y: (z.minY + z.maxY) / 2 },
    adjacency: Object.fromEntries(z.adjacency.map((a) => [a.zoneCode, a.cost])),
  }));

  // Pull some PENDING orders and turn them into pre-optimized waves.
  const pending = await prisma.order.findMany({ where: { status: 'PENDING' }, take: scenario.heroWaves * 6 });
  for (let w = 0; w < scenario.heroWaves; w++) {
    const slice = pending.slice(w * 6, w * 6 + 6);
    if (slice.length === 0) break;
    const waveId = randomUUID();
    const lines: pick.WaveOrderLine[] = [];
    for (const o of slice) {
      for (const li of o.lineItems as unknown as { skuId: string; quantity: number; allocatedBinId: string }[]) {
        const s = skus.find((x) => x.id === li.skuId);
        if (!s) continue;
        lines.push({
          orderId: o.id,
          skuId: s.id,
          skuCode: s.code,
          name: s.name,
          imageUrl: s.imageUrl,
          qty: li.quantity,
          binId: li.allocatedBinId,
        });
      }
    }
    const stops = pick.buildStops(lines, binMeta);
    const route = routing.optimizeRoute(stops, { depot: { x: 0, y: 0 }, zoneGraph, returnToDepot: true });
    await prisma.wave.create({
      data: {
        id: waveId,
        ...T,
        name: `W-${240 + w}`,
        status: 'DRAFT',
        mode: 'SINGLE',
        pickerId,
        orderIds: slice.map((o) => o.id),
        optimizedRoute: route as unknown as Prisma.InputJsonValue,
        estimatedDurationSec: route.estimatedDurationSec,
      },
    });
    await prisma.order.updateMany({ where: { id: { in: slice.map((o) => o.id) } }, data: { status: 'WAVED', waveId } });
  }
  console.log(`  ✓ ${scenario.heroWaves} pre-optimized hero wave(s)`);
}

// ---------------------------------------------------------------------------
// helpers

function groupByZone(skus: SeedSku[]): Map<string, SeedSku[]> {
  const m = new Map<string, SeedSku[]>();
  for (const s of skus) (m.get(s.primaryBinZone) ?? m.set(s.primaryBinZone, []).get(s.primaryBinZone)!).push(s);
  return m;
}

function weightedSku(rng: ReturnType<typeof resetRng>['rng'], pool: SeedSku[]): SeedSku {
  // Bias toward higher-popularity SKUs so orders look realistic.
  const total = pool.reduce((s, x) => s + x.popularity, 0);
  let r = rng() * total;
  for (const s of pool) {
    r -= s.popularity;
    if (r <= 0) return s;
  }
  return pool[pool.length - 1]!;
}

function slaFor(rng: ReturnType<typeof resetRng>['rng'], i: number, total: number): Date {
  const frac = i / total;
  if (frac < 0.12) return new Date(NOW.getTime() - intBetween(rng, 1, 4) * 3_600_000); // overdue
  if (frac < 0.4) return new Date(NOW.getTime() + intBetween(rng, 1, 2) * 3_600_000); // soon
  if (frac < 0.7) return new Date(NOW.getTime() + intBetween(rng, 4, 12) * 3_600_000); // today
  return new Date(NOW.getTime() + intBetween(rng, 1, 4) * 86_400_000); // future
}

async function batchedCreate(model: string, rows: unknown[], batch = 2000) {
  for (let i = 0; i < rows.length; i += batch) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[model].createMany({ data: rows.slice(i, i + batch) });
  }
}

async function truncateAll() {
  // Order matters for FKs; TRUNCATE CASCADE is simplest and fast.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "cycle_count_lines","cycle_counts","channel_allocations","velocity_classification",
      "inventory_current","transactions","orders","waves","asns","vendors","skus","bins","zones",
      "dashboard_kpis","audit_logs","users","warehouses","tenants"
    RESTART IDENTITY CASCADE;
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
