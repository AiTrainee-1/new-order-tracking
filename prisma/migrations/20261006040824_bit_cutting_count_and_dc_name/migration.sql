-- AlterTable
ALTER TABLE "production_txns" ADD COLUMN     "dc_name" TEXT,
ADD COLUMN     "qty_count" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- Bit Cutting is recorded by weight (Bit KG) plus a bit count rather than
-- size by size, so new orders should freeze it as a KG stage. Only the
-- catalog row changes: orders already created keep the stage-plan row they
-- were created with (the app reads Bit Cutting as KG regardless - see
-- src/lib/dualUnit.ts).
UPDATE "stage_definitions" SET "unit_type" = 'KG' WHERE "key" = 'bit_cutting';
