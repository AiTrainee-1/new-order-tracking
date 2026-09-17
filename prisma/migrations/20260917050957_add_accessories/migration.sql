-- CreateEnum
CREATE TYPE "AccessoryEntryType" AS ENUM ('purchase', 'inward', 'dispatch');

-- AlterEnum
ALTER TYPE "StageFormType" ADD VALUE 'accessories';

-- CreateTable
CREATE TABLE "accessory_requirements" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "po_id" UUID,
    "name" TEXT NOT NULL,
    "required_qty" DECIMAL(14,3) NOT NULL,
    "unit" "UnitType" NOT NULL,
    "required_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessory_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_entries" (
    "id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "entry_type" "AccessoryEntryType" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "entry_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT,
    "doc_no" TEXT,
    "sent_to" TEXT,
    "notes" TEXT,
    "entered_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accessory_requirements_order_id_idx" ON "accessory_requirements"("order_id");

-- CreateIndex
CREATE INDEX "accessory_entries_requirement_id_idx" ON "accessory_entries"("requirement_id");

-- AddForeignKey
ALTER TABLE "accessory_requirements" ADD CONSTRAINT "accessory_requirements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_requirements" ADD CONSTRAINT "accessory_requirements_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_requirements" ADD CONSTRAINT "accessory_requirements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_entries" ADD CONSTRAINT "accessory_entries_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "accessory_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_entries" ADD CONSTRAINT "accessory_entries_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
