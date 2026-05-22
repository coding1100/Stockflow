import { prisma } from './client.js';

/**
 * Returns a tenant-scoped Prisma client. Every read is filtered to the tenant and
 * every create is stamped with tenantId, so application code can never accidentally
 * cross tenants. This is the application-layer enforcement; the production hardening
 * path adds Postgres row-level-security policies as defence-in-depth (see migrations).
 *
 * Models without a tenantId column (e.g. CycleCountLine, which is scoped through its
 * parent) are passed through untouched.
 */
const SCOPED_MODELS = new Set([
  'Warehouse',
  'User',
  'Zone',
  'Bin',
  'Sku',
  'Vendor',
  'Asn',
  'Transaction',
  'Order',
  'Wave',
  'InventoryCurrent',
  'VelocityClassification',
  'ChannelAllocation',
  'CycleCount',
  'DashboardKpi',
  'AuditLog',
]);

const WRITE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);
const FILTER_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

export function forTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SCOPED_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, unknown>;

          if (FILTER_OPS.has(operation)) {
            a.where = { AND: [a.where ?? {}, { tenantId }] };
          } else if (WRITE_OPS.has(operation)) {
            if (operation === 'createMany' || operation === 'createManyAndReturn') {
              const data = a.data as Record<string, unknown> | Record<string, unknown>[];
              a.data = Array.isArray(data)
                ? data.map((d) => ({ ...d, tenantId }))
                : { ...data, tenantId };
            } else {
              a.data = { ...(a.data as Record<string, unknown>), tenantId };
            }
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forTenant>;
