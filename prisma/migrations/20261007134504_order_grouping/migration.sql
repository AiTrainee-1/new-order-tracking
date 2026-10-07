-- AlterTable
ALTER TABLE "production_txns" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "group_link_id" UUID;

-- CreateTable
CREATE TABLE "order_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "io_no" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_group_links" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "stage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_group_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_group_links_group_id_idx" ON "order_group_links"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_group_links_order_id_stage_key_key" ON "order_group_links"("order_id", "stage_key");

-- CreateIndex
CREATE INDEX "production_txns_group_link_id_idx" ON "production_txns"("group_link_id");

-- AddForeignKey
ALTER TABLE "production_txns" ADD CONSTRAINT "production_txns_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_group_links" ADD CONSTRAINT "order_group_links_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "order_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_group_links" ADD CONSTRAINT "order_group_links_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
