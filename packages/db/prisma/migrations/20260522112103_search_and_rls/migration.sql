-- Search: trigram indexes for sub-200ms SKU lookup by code/name over a large catalog.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS skus_code_trgm_idx ON "skus" USING gin ("code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS skus_name_trgm_idx ON "skus" USING gin ("name" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY (production hardening path)
--
-- The demo enforces tenant isolation at the application layer (Prisma client
-- extension in src/tenancy.ts). Defence-in-depth for production enables Postgres
-- RLS so a query can never read across tenants even if app code is wrong. It is
-- written here (commented) because it requires the app to set `app.tenant_id` per
-- connection (SET LOCAL), which interacts with Prisma's connection pooling and is
-- enabled as a deliberate, separately-tested step.
--
-- Example (enable per scoped table):
--   ALTER TABLE "skus" ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON "skus"
--     USING ("tenant_id" = current_setting('app.tenant_id')::uuid);
-- Repeat for every tenant-scoped table; set via `SET LOCAL app.tenant_id = '...'`
-- at the start of each request transaction.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TRANSACTION PARTITIONING (production hardening path)
--
-- PRD §6.2 specifies monthly RANGE partitioning of "transactions" on occurred_at.
-- Native partitioning requires the partition key in the primary key, which Prisma
-- does not model directly, so it is applied as an explicit migration in production:
--   1. rename "transactions" -> "transactions_legacy"
--   2. CREATE TABLE "transactions" (... , PRIMARY KEY (id, occurred_at))
--        PARTITION BY RANGE (occurred_at);
--   3. pre-create monthly partitions (prev/current/next) + a pg_partman/cron job
--   4. backfill from legacy, drop legacy.
-- For the demo the table is unpartitioned but carries the two PRD-mandated indexes
-- (sku_id, occurred_at) and (bin_id, occurred_at), which keep it performant at the
-- demo's data volume.
-- ---------------------------------------------------------------------------