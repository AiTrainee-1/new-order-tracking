-- CreateEnum
CREATE TYPE "TnaEventKind" AS ENUM ('assigned', 'rescheduled', 'cleared', 'completed');

-- CreateTable
CREATE TABLE "tna_plans" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "stage_key" TEXT NOT NULL,
    "planned_start" TIMESTAMP(3) NOT NULL,
    "planned_end" TIMESTAMP(3) NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actual_start_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tna_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tna_events" (
    "id" UUID NOT NULL,
    "plan_id" UUID,
    "order_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "stage_key" TEXT NOT NULL,
    "kind" "TnaEventKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "data" JSONB NOT NULL,

    CONSTRAINT "tna_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tna_plans_order_id_idx" ON "tna_plans"("order_id");

-- CreateIndex
CREATE INDEX "tna_plans_planned_end_idx" ON "tna_plans"("planned_end");

-- CreateIndex
CREATE UNIQUE INDEX "tna_plans_section_id_key" ON "tna_plans"("section_id");

-- CreateIndex
CREATE INDEX "tna_events_order_id_idx" ON "tna_events"("order_id");

-- CreateIndex
CREATE INDEX "tna_events_plan_id_idx" ON "tna_events"("plan_id");

-- CreateIndex
CREATE INDEX "tna_events_section_id_at_idx" ON "tna_events"("section_id", "at");

-- AddForeignKey
ALTER TABLE "tna_plans" ADD CONSTRAINT "tna_plans_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tna_plans" ADD CONSTRAINT "tna_plans_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "order_stage_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tna_plans" ADD CONSTRAINT "tna_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tna_plans" ADD CONSTRAINT "tna_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tna_events" ADD CONSTRAINT "tna_events_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "tna_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tna_events" ADD CONSTRAINT "tna_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tna_events" ADD CONSTRAINT "tna_events_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "order_stage_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tna_events" ADD CONSTRAINT "tna_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
