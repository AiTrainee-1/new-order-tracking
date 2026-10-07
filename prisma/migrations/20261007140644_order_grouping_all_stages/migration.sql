-- AlterTable
ALTER TABLE "accessory_entries" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "group_link_id" UUID;

-- AlterTable
ALTER TABLE "accessory_requirements" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "group_link_id" UUID;

-- AlterTable
ALTER TABLE "material_entries" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "group_link_id" UUID;

-- AlterTable
ALTER TABLE "material_requirements" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "group_link_id" UUID;

-- AlterTable
ALTER TABLE "stage_entries" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "group_link_id" UUID;

-- CreateIndex
CREATE INDEX "accessory_entries_group_link_id_idx" ON "accessory_entries"("group_link_id");

-- CreateIndex
CREATE INDEX "accessory_requirements_group_link_id_idx" ON "accessory_requirements"("group_link_id");

-- CreateIndex
CREATE INDEX "material_entries_group_link_id_idx" ON "material_entries"("group_link_id");

-- CreateIndex
CREATE INDEX "material_requirements_group_link_id_idx" ON "material_requirements"("group_link_id");

-- CreateIndex
CREATE INDEX "stage_entries_group_link_id_idx" ON "stage_entries"("group_link_id");

-- AddForeignKey
ALTER TABLE "stage_entries" ADD CONSTRAINT "stage_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_entries" ADD CONSTRAINT "material_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_requirements" ADD CONSTRAINT "accessory_requirements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_entries" ADD CONSTRAINT "accessory_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
