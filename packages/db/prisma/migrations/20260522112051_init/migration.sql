-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OPERATIONS_LEAD', 'RECEIVING_CLERK', 'PICKER', 'VENDOR_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VelocityTier" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "AdapterType" AS ENUM ('EDI', 'API', 'CSV', 'EMAIL');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AsnStatus" AS ENUM ('SCHEDULED', 'EN_ROUTE', 'IN_BAY', 'RECEIVING', 'COMPLETED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECEIPT', 'PICK', 'COUNT', 'ADJUSTMENT', 'TRANSFER', 'RETURN');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('STORE', 'ECOM', 'MARKETPLACE', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'WAVED', 'PICKING', 'PICKED', 'PACKED', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaveStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WaveMode" AS ENUM ('SINGLE', 'BATCH');

-- CreateEnum
CREATE TYPE "CountScope" AS ENUM ('ZONE', 'TIER');

-- CreateEnum
CREATE TYPE "CountStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CountLineStatus" AS ENUM ('PENDING', 'COUNTED', 'VARIANCE_ACCEPTED', 'ESCALATED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "depot_x" INTEGER NOT NULL DEFAULT 0,
    "depot_y" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_x" INTEGER NOT NULL,
    "min_y" INTEGER NOT NULL,
    "max_x" INTEGER NOT NULL,
    "max_y" INTEGER NOT NULL,
    "adjacency" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bins" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "capacity_units" INTEGER NOT NULL,
    "current_units" INTEGER NOT NULL DEFAULT 0,
    "restrictions" JSONB NOT NULL DEFAULT '{}',
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skus" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "weight_g" INTEGER NOT NULL,
    "dimensionsMm" JSONB NOT NULL DEFAULT '{}',
    "hazmat" BOOLEAN NOT NULL DEFAULT false,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "max_stock" INTEGER NOT NULL DEFAULT 0,
    "velocity_tier" "VelocityTier",
    "channelRules" JSONB NOT NULL DEFAULT '{}',
    "vendorSkus" JSONB NOT NULL DEFAULT '[]',
    "primary_bin_id" UUID,
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contact" JSONB NOT NULL DEFAULT '{}',
    "payment_terms" TEXT,
    "adapter_type" "AdapterType" NOT NULL DEFAULT 'CSV',
    "adapter_config" JSONB NOT NULL DEFAULT '{}',
    "sla" JSONB NOT NULL DEFAULT '{}',
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "po_number" TEXT NOT NULL,
    "expected_arrival" TIMESTAMPTZ(6) NOT NULL,
    "dock_bay" TEXT,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "status" "AsnStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "sku_id" UUID NOT NULL,
    "bin_id" UUID,
    "quantity" INTEGER NOT NULL,
    "source_id" UUID,
    "source_type" TEXT,
    "user_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "sla_due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "wave_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waves" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WaveStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "WaveMode" NOT NULL DEFAULT 'SINGLE',
    "picker_id" UUID,
    "order_ids" UUID[],
    "optimized_route" JSONB,
    "tote_map" JSONB NOT NULL DEFAULT '{}',
    "estimated_duration_sec" INTEGER,
    "actual_duration_sec" INTEGER,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_current" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "bin_id" UUID,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "allocated" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "in_transit" INTEGER NOT NULL DEFAULT 0,
    "last_transaction_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_current_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "velocity_classification" (
    "sku_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rolling_30d_pick" INTEGER NOT NULL DEFAULT 0,
    "tier" "VelocityTier" NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "velocity_classification_pkey" PRIMARY KEY ("sku_id")
);

-- CreateTable
CREATE TABLE "channel_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "reserved_qty" INTEGER NOT NULL DEFAULT 0,
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_counts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "scope" "CountScope" NOT NULL,
    "scope_value" TEXT NOT NULL,
    "status" "CountStatus" NOT NULL DEFAULT 'PENDING',
    "assignee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_count_lines" (
    "id" UUID NOT NULL,
    "cycle_count_id" UUID NOT NULL,
    "bin_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER,
    "variance" INTEGER,
    "reason_code" TEXT,
    "status" "CountLineStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "cycle_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_kpis" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "picks_count" INTEGER NOT NULL DEFAULT 0,
    "receipts_count" INTEGER NOT NULL DEFAULT 0,
    "shipments_count" INTEGER NOT NULL DEFAULT 0,
    "pick_time_sec_sum" INTEGER NOT NULL DEFAULT 0,
    "pick_time_samples" INTEGER NOT NULL DEFAULT 0,
    "count_variance_abs" INTEGER NOT NULL DEFAULT 0,
    "count_units" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "sku_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_code_key" ON "warehouses"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "zones_tenant_id_code_key" ON "zones"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "bins_zone_id_idx" ON "bins"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "bins_tenant_id_code_key" ON "bins"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "skus_tenant_id_category_idx" ON "skus"("tenant_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "skus_tenant_id_code_key" ON "skus"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "skus_tenant_id_barcode_key" ON "skus"("tenant_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_tenant_id_code_key" ON "vendors"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "transactions_sku_id_occurred_at_idx" ON "transactions"("sku_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_bin_id_occurred_at_idx" ON "transactions"("bin_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_source_type_source_id_idx" ON "transactions"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_status_idx" ON "orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "orders_wave_id_idx" ON "orders"("wave_id");

-- CreateIndex
CREATE INDEX "waves_tenant_id_status_idx" ON "waves"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "inventory_current_tenant_id_sku_id_idx" ON "inventory_current"("tenant_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_current_sku_id_bin_id_key" ON "inventory_current"("sku_id", "bin_id");

-- CreateIndex
CREATE INDEX "channel_allocations_sku_id_channel_idx" ON "channel_allocations"("sku_id", "channel");

-- CreateIndex
CREATE INDEX "cycle_counts_tenant_id_status_idx" ON "cycle_counts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "cycle_count_lines_cycle_count_id_idx" ON "cycle_count_lines"("cycle_count_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_kpis_tenant_id_warehouse_id_day_key" ON "dashboard_kpis"("tenant_id", "warehouse_id", "day");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bins" ADD CONSTRAINT "bins_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skus" ADD CONSTRAINT "skus_primary_bin_id_fkey" FOREIGN KEY ("primary_bin_id") REFERENCES "bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asns" ADD CONSTRAINT "asns_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "waves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waves" ADD CONSTRAINT "waves_picker_id_fkey" FOREIGN KEY ("picker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_current" ADD CONSTRAINT "inventory_current_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_current" ADD CONSTRAINT "inventory_current_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "velocity_classification" ADD CONSTRAINT "velocity_classification_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_allocations" ADD CONSTRAINT "channel_allocations_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_cycle_count_id_fkey" FOREIGN KEY ("cycle_count_id") REFERENCES "cycle_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
