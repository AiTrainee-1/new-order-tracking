-- AlterTable
ALTER TABLE "accessory_entries" ADD COLUMN "size_breakdown" JSONB;

-- AlterTable
-- Cast in place (USING) rather than drop+recreate, so existing rows keep
-- their unit value instead of losing it - this column is now a free string
-- (CONE, METERS, GROSS, ...), not the KG/PCS enum, but every existing value
-- is still valid text.
ALTER TABLE "accessory_requirements" ADD COLUMN "size_breakdown" JSONB;
ALTER TABLE "accessory_requirements" ALTER COLUMN "unit" TYPE TEXT USING "unit"::TEXT;
