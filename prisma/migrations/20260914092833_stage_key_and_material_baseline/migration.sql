/*
  Warnings:

  - Added the required column `key` to the `order_stage_plan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "order_stage_plan" ADD COLUMN     "draws_material_baseline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "key" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stage_definitions" ADD COLUMN     "draws_material_baseline" BOOLEAN NOT NULL DEFAULT false;
