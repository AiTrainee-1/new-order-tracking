-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('KG', 'PCS');

-- CreateEnum
CREATE TYPE "StageFormType" AS ENUM ('confirmation', 'material_planning', 'supplier_dc', 'material_inward', 'knitting', 'lot_send_receive', 'lot_process', 'lot_inspection', 'fabric_store', 'simple_confirm', 'cutting', 'panel_check', 'embroidery', 'sewing', 'garment_qc', 'garment_process', 'packing');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('none', 'branch', 'unit', 'outside', 'others');

-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('yarn', 'fabric');

-- CreateEnum
CREATE TYPE "MaterialEntryType" AS ENUM ('plan', 'dc', 'receipt', 'inward');

-- CreateEnum
CREATE TYPE "TxnType" AS ENUM ('process', 'send', 'receive', 'rework');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete');

-- CreateTable
CREATE TABLE "app_users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_plain" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "phone" TEXT,
    "is_monitor_only" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "can_create_orders" BOOLEAN NOT NULL DEFAULT false,
    "can_job_work" BOOLEAN NOT NULL DEFAULT false,
    "last_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_definitions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit_type" "UnitType" NOT NULL,
    "typical_duration_days" INTEGER NOT NULL DEFAULT 3,
    "form_type" "StageFormType" NOT NULL,
    "is_order_origin" BOOLEAN NOT NULL DEFAULT false,
    "is_procurement" BOOLEAN NOT NULL DEFAULT false,
    "procurement_rank" INTEGER,
    "no_lot_tracking" BOOLEAN NOT NULL DEFAULT false,
    "can_be_lot_origin" BOOLEAN NOT NULL DEFAULT false,
    "can_be_size_origin" BOOLEAN NOT NULL DEFAULT false,
    "is_passthrough" BOOLEAN NOT NULL DEFAULT false,
    "is_final_output" BOOLEAN NOT NULL DEFAULT false,
    "is_fabric_checkpoint" BOOLEAN NOT NULL DEFAULT false,
    "include_in_loss_rows" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_plan_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_plan_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_plan_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "stage_definition_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "stage_plan_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_stage_plan" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "stage_definition_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "unit_type" "UnitType" NOT NULL,
    "typical_duration_days" INTEGER NOT NULL,
    "form_type" "StageFormType" NOT NULL,
    "no_lot_tracking" BOOLEAN NOT NULL,
    "is_order_origin" BOOLEAN NOT NULL DEFAULT false,
    "is_procurement" BOOLEAN NOT NULL DEFAULT false,
    "procurement_rank" INTEGER,
    "is_lot_origin" BOOLEAN NOT NULL DEFAULT false,
    "is_size_origin" BOOLEAN NOT NULL DEFAULT false,
    "is_passthrough" BOOLEAN NOT NULL DEFAULT false,
    "is_final_output" BOOLEAN NOT NULL DEFAULT false,
    "is_fabric_checkpoint" BOOLEAN NOT NULL DEFAULT false,
    "include_in_loss_rows" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_stage_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "io_no" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "fabric" TEXT,
    "image_id" UUID,
    "total_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cut_quantity" DECIMAL(14,3),
    "delivery_date" DATE,
    "created_by" UUID,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_images" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "po_number" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cut_quantity" DECIMAL(14,3),
    "extra_percent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "delivery_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_size_quantities" (
    "id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "size_code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_size_quantities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "po_id" UUID,
    "section_id" UUID NOT NULL,
    "unit_name" TEXT,
    "can_enter_data" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stage_definition_id" UUID NOT NULL,
    "can_enter_data" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_entries" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "po_id" UUID,
    "section_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unit_type" "UnitType" NOT NULL,
    "qty_received" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_completed_today" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_forwarded" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_shortage" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_rejected" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_returned" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "external_unit_name" TEXT,
    "is_sent_outside" BOOLEAN NOT NULL DEFAULT false,
    "is_returned" BOOLEAN NOT NULL DEFAULT false,
    "is_forwarded" BOOLEAN NOT NULL DEFAULT false,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "branch" TEXT,
    "unit_name" TEXT,
    "transfer_type" "TransferType" NOT NULL DEFAULT 'none',
    "transfer_to" TEXT,
    "notes" TEXT,
    "entered_by" UUID NOT NULL,
    "forwarded_to_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_lots" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "po_id" UUID,
    "lot_no" TEXT NOT NULL,
    "fabric_type" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_requirements" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "po_id" UUID,
    "category" "MaterialCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "required_qty" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "supplier" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_entries" (
    "id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "entry_type" "MaterialEntryType" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "entry_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier" TEXT,
    "doc_no" TEXT,
    "doc_date" DATE,
    "lot_ref" TEXT,
    "notes" TEXT,
    "entered_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_txns" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "po_id" UUID,
    "section_id" UUID NOT NULL,
    "lot_id" UUID,
    "size_code" TEXT,
    "txn_type" "TxnType" NOT NULL,
    "unit" "UnitType" NOT NULL,
    "qty_in" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_out" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_rejected" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_rework" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "ref_name" TEXT,
    "doc_no" TEXT,
    "entry_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "entered_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_job_work" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "production_txns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "order_id" UUID,
    "po_id" UUID,
    "section_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "notes" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_username_key" ON "app_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "stage_definitions_key_key" ON "stage_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "stage_plan_templates_name_key" ON "stage_plan_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stage_plan_template_items_template_id_seq_key" ON "stage_plan_template_items"("template_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "stage_plan_template_items_template_id_stage_definition_id_key" ON "stage_plan_template_items"("template_id", "stage_definition_id");

-- CreateIndex
CREATE INDEX "order_stage_plan_order_id_idx" ON "order_stage_plan"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_stage_plan_order_id_seq_key" ON "order_stage_plan"("order_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "order_stage_plan_order_id_stage_definition_id_key" ON "order_stage_plan"("order_id", "stage_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_image_id_key" ON "orders"("image_id");

-- CreateIndex
CREATE INDEX "orders_io_no_idx" ON "orders"("io_no");

-- CreateIndex
CREATE INDEX "purchase_orders_order_id_idx" ON "purchase_orders"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "po_size_quantities_po_id_size_code_key" ON "po_size_quantities"("po_id", "size_code");

-- CreateIndex
CREATE INDEX "user_assignments_order_id_idx" ON "user_assignments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_assignments_user_id_order_id_po_id_section_id_unit_nam_key" ON "user_assignments"("user_id", "order_id", "po_id", "section_id", "unit_name");

-- CreateIndex
CREATE UNIQUE INDEX "stage_assignments_user_id_stage_definition_id_key" ON "stage_assignments"("user_id", "stage_definition_id");

-- CreateIndex
CREATE INDEX "stage_entries_order_id_idx" ON "stage_entries"("order_id");

-- CreateIndex
CREATE INDEX "stage_entries_section_id_idx" ON "stage_entries"("section_id");

-- CreateIndex
CREATE INDEX "production_lots_order_id_idx" ON "production_lots"("order_id");

-- CreateIndex
CREATE INDEX "material_requirements_order_id_idx" ON "material_requirements"("order_id");

-- CreateIndex
CREATE INDEX "material_entries_requirement_id_idx" ON "material_entries"("requirement_id");

-- CreateIndex
CREATE INDEX "production_txns_order_id_idx" ON "production_txns"("order_id");

-- CreateIndex
CREATE INDEX "production_txns_section_id_idx" ON "production_txns"("section_id");

-- CreateIndex
CREATE INDEX "production_txns_lot_id_idx" ON "production_txns"("lot_id");

-- CreateIndex
CREATE INDEX "audit_log_order_id_idx" ON "audit_log"("order_id");

-- AddForeignKey
ALTER TABLE "stage_plan_templates" ADD CONSTRAINT "stage_plan_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_plan_template_items" ADD CONSTRAINT "stage_plan_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "stage_plan_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_plan_template_items" ADD CONSTRAINT "stage_plan_template_items_stage_definition_id_fkey" FOREIGN KEY ("stage_definition_id") REFERENCES "stage_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_stage_plan" ADD CONSTRAINT "order_stage_plan_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_stage_plan" ADD CONSTRAINT "order_stage_plan_stage_definition_id_fkey" FOREIGN KEY ("stage_definition_id") REFERENCES "stage_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "order_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_size_quantities" ADD CONSTRAINT "po_size_quantities_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "order_stage_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_assignments" ADD CONSTRAINT "stage_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_assignments" ADD CONSTRAINT "stage_assignments_stage_definition_id_fkey" FOREIGN KEY ("stage_definition_id") REFERENCES "stage_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_entries" ADD CONSTRAINT "stage_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_entries" ADD CONSTRAINT "stage_entries_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_entries" ADD CONSTRAINT "stage_entries_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "order_stage_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_entries" ADD CONSTRAINT "stage_entries_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_entries" ADD CONSTRAINT "stage_entries_forwarded_to_user_id_fkey" FOREIGN KEY ("forwarded_to_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lots" ADD CONSTRAINT "production_lots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lots" ADD CONSTRAINT "production_lots_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lots" ADD CONSTRAINT "production_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_entries" ADD CONSTRAINT "material_entries_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "material_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_entries" ADD CONSTRAINT "material_entries_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_entries" ADD CONSTRAINT "material_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_txns" ADD CONSTRAINT "production_txns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_txns" ADD CONSTRAINT "production_txns_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_txns" ADD CONSTRAINT "production_txns_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "order_stage_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_txns" ADD CONSTRAINT "production_txns_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "production_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_txns" ADD CONSTRAINT "production_txns_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_txns" ADD CONSTRAINT "production_txns_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "order_stage_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
