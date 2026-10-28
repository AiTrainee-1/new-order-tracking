import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { validateStagePlan } from "@/lib/stagePlan";

/**
 * What creating (POST /api/orders) and editing (PATCH /api/orders/[orderId]) an order share: the body
 * schemas, how a PO's quantity is worked out, the stage-plan row fields frozen from the catalog, and the
 * "has anyone recorded production here" check that guards destructive edits.
 */

const count = (label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number({ invalid_type_error: `Enter a valid ${label}.` }).finite(`Enter a valid ${label}.`).min(0, `The ${label} can't be negative.`),
  );
const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v : null));
const requiredText = (message: string) => z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message);

const poSize = z.object({
  sizeCode: requiredText("Every size needs a size code."),
  sortOrder: z.number().int(),
  quantity: count("size quantity"),
});

const poFields = {
  poNumber: requiredText("Every PO needs a PO number."),
  /** Only used when a PO has no size breakdown - see poQuantity. */
  quantity: count("PO quantity").optional(),
  extraPercent: count("extra %").optional(),
  deliveryDate: z.string().nullish(),
  sizes: z.array(poSize).default([]),
};

const stagePlanBody = z.object({
  stages: z.array(z.object({ stageDefinitionId: z.string().min(1), seq: z.number().int() })).min(1, "A stage plan is required."),
  sizeOriginStageDefinitionId: z.string().nullable(),
  lotOriginStageDefinitionId: z.string().nullable(),
});

export const orderCreateBody = z.object({
  ioNo: requiredText("ioNo and style are required."),
  style: requiredText("ioNo and style are required."),
  description: optionalText,
  color: optionalText,
  fabric: optionalText,
  buyerId: z.string().nullish().transform((v) => v || null),
  deliveryDate: z.string().nullish(),
  imageId: z.string().nullish().transform((v) => v || null),
  purchaseOrders: z.array(z.object({ ...poFields, cutQuantity: count("cut quantity").nullish() })).min(1, "At least one purchase order is required."),
  stagePlan: stagePlanBody,
});

export const orderUpdateBody = z.object({
  ioNo: requiredText("ioNo can't be blank.").optional(),
  style: requiredText("style can't be blank.").optional(),
  description: z.string().nullish(),
  color: z.string().nullish(),
  fabric: z.string().nullish(),
  buyerId: z.string().nullish(),
  deliveryDate: z.string().nullish(),
  imageId: z.string().nullish(),
  isHidden: z.boolean().optional(),
  /** `id` is an existing PurchaseOrder to update in place; omitted for a new row (see the PATCH handler). */
  purchaseOrders: z.array(z.object({ id: z.string().optional(), ...poFields })).min(1, "An order needs at least one PO.").optional(),
  stagePlan: stagePlanBody.optional(),
});

/**
 * A PO's quantity: the sum of its size breakdown, which is what every progress figure is measured against.
 * A PO entered without sizes keeps the quantity typed for it. Create and edit both use this, so an order's
 * quantities come out the same however it was last saved.
 */
export function poQuantity(po: { quantity?: number; sizes: { quantity: number }[] }): number {
  if (po.sizes.length > 0) return po.sizes.reduce((total, s) => total + s.quantity, 0);
  return po.quantity ?? 0;
}

type StagePlanRow = Extract<ReturnType<typeof validateStagePlan>, { ok: true }>["rows"][number];

/** The order_stage_plan fields copied from the catalog when a stage is added to (or kept on) an order. */
export function stagePlanFields(row: StagePlanRow) {
  return {
    seq: row.seq,
    key: row.catalog.key,
    label: row.catalog.label,
    unitType: row.catalog.unitType,
    typicalDurationDays: row.catalog.typicalDurationDays,
    formType: row.catalog.formType,
    noLotTracking: row.catalog.noLotTracking,
    isOrderOrigin: row.catalog.isOrderOrigin,
    isProcurement: row.catalog.isProcurement,
    procurementRank: row.catalog.procurementRank,
    isLotOrigin: row.isLotOrigin,
    isSizeOrigin: row.isSizeOrigin,
    isPassthrough: row.catalog.isPassthrough,
    isFinalOutput: row.catalog.isFinalOutput,
    isFabricCheckpoint: row.catalog.isFabricCheckpoint,
    drawsMaterialBaseline: row.catalog.drawsMaterialBaseline,
    includeInLossRows: row.catalog.includeInLossRows,
  };
}

/**
 * Has anyone recorded production under this scope (an order, some of its POs, or some of its stages)? Deleting
 * such a scope cascades away other people's entries - and the audit log rows about them - so only an Admin
 * may do it.
 */
export async function hasProductionHistory(
  tx: Prisma.TransactionClient,
  scope: { orderId: string } | { poIds: string[] } | { sectionIds: string[] },
): Promise<boolean> {
  if ("poIds" in scope && scope.poIds.length === 0) return false;
  if ("sectionIds" in scope && scope.sectionIds.length === 0) return false;
  const where =
    "orderId" in scope ? { orderId: scope.orderId } : "poIds" in scope ? { poId: { in: scope.poIds } } : { sectionId: { in: scope.sectionIds } };
  const requirementWhere = "orderId" in scope ? { orderId: scope.orderId } : "poIds" in scope ? { poId: { in: scope.poIds } } : null;
  const counts = await Promise.all([
    tx.productionTxn.count({ where }),
    tx.stageEntry.count({ where }),
    requirementWhere ? tx.materialEntry.count({ where: { requirement: requirementWhere } }) : Promise.resolve(0),
    requirementWhere ? tx.accessoryEntry.count({ where: { requirement: requirementWhere } }) : Promise.resolve(0),
  ]);
  return counts.some((n) => n > 0);
}
