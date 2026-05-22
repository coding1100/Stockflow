/** Integration smoke test: publish a PICK event and confirm the materializer projects it. */
import { prisma, DEMO_TENANT_ID, DEMO_WAREHOUSE_ID } from '../src/index.js';
import { publishInventoryEvent, getRedis } from '@stockflow/events';
import { randomUUID } from 'node:crypto';

async function main() {
  const sku = await prisma.sku.findFirstOrThrow({ where: { primaryBinId: { not: null } }, include: { inventory: true } });
  const binId = sku.primaryBinId!;
  const before = await prisma.inventoryCurrent.findUnique({ where: { skuId_binId: { skuId: sku.id, binId } } });
  console.log(`SKU ${sku.code} onHand before: ${before?.onHand}`);

  await publishInventoryEvent({
    transactionId: randomUUID(),
    tenantId: DEMO_TENANT_ID,
    warehouseId: DEMO_WAREHOUSE_ID,
    type: 'PICK',
    skuId: sku.id,
    binId,
    quantity: -1,
    occurredAt: new Date().toISOString(),
  });

  // Wait for the materializer (running in the worker) to project.
  await new Promise((r) => setTimeout(r, 2500));
  const after = await prisma.inventoryCurrent.findUnique({ where: { skuId_binId: { skuId: sku.id, binId } } });
  console.log(`SKU ${sku.code} onHand after:  ${after?.onHand}`);

  const ok = (after?.onHand ?? 0) === (before?.onHand ?? 0) - 1;
  console.log(ok ? '✅ Materializer projected the event (<2.5s)' : '❌ Read model did not update');
  await prisma.$disconnect();
  getRedis().disconnect();
  process.exit(ok ? 0 : 1);
}

main();
