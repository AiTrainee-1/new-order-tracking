import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { validateStagePlan, type StagePlanCatalogEntry } from "@/lib/stagePlan";

export async function GET(_request: Request, context: RouteContext<"/api/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      image: { select: { id: true, contentType: true } },
      purchaseOrders: { include: { sizeQuantities: { orderBy: { sortOrder: "asc" } } } },
      stagePlan: { orderBy: { seq: "asc" } },
    },
  });

  if (!order) return apiError(404, "Order not found.");

  if (order.isHidden) {
    const allowed = order.createdBy === auth.session.userId || (await isAdmin(auth.session.userId));
    if (!allowed) return apiError(404, "Order not found.");
  }

  return NextResponse.json({ order: serializeForJson(order) });
}

/** Only Admin, or the floor user who created the order, may hide/unhide or
 *  delete it - "create, and manage what you created, not what it's used for
 *  afterward" (see CreateOrderPage's module comment). */
async function canManage(userId: string, order: { createdBy: string | null }): Promise<boolean> {
  if (order.createdBy === userId) return true;
  return isAdmin(userId);
}

interface UpdatePoSizeBody {
  sizeCode: string;
  sortOrder: number;
  quantity: number;
}

interface UpdatePoBody {
  /** An existing PurchaseOrder id to update in place, or omitted for a new
   *  row - kept distinct from a fresh create so its id (a real FK target for
   *  production_txns/stage_entries/user_assignments/material_requirements/
   *  accessory_requirements/production_lots) never changes under editing. */
  id?: string;
  poNumber: string;
  extraPercent?: number;
  deliveryDate?: string | null;
  sizes: UpdatePoSizeBody[];
}

interface UpdateOrderBody {
  ioNo?: string;
  style?: string;
  description?: string | null;
  color?: string | null;
  fabric?: string | null;
  deliveryDate?: string | null;
  imageId?: string | null;
  isHidden?: boolean;
  purchaseOrders?: UpdatePoBody[];
  stagePlan?: {
    stages: { stageDefinitionId: string; seq: number }[];
    sizeOriginStageDefinitionId: string | null;
    lotOriginStageDefinitionId: string | null;
  };
}

function poQty(sizes: UpdatePoSizeBody[]): number {
  return sizes.reduce((total, s) => total + (Number(s.quantity) || 0), 0);
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;
  const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { createdBy: true } });
  if (!existing) return apiError(404, "Order not found.");
  if (!(await canManage(auth.session.userId, existing))) {
    return apiError(403, "You don't have permission to change this order.");
  }

  const body = (await request.json().catch(() => null)) as UpdateOrderBody | null;
  if (!body) return apiError(400, "Invalid request body.");

  const data: Record<string, unknown> = {};
  if (typeof body.ioNo === "string") data.ioNo = body.ioNo.trim();
  if (typeof body.style === "string") data.style = body.style.trim();
  if (body.description !== undefined) data.description = body.description || null;
  if (body.color !== undefined) data.color = body.color || null;
  if (body.fabric !== undefined) data.fabric = body.fabric || null;
  if (body.deliveryDate !== undefined) data.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
  if (body.imageId !== undefined) data.imageId = body.imageId;
  if (typeof body.isHidden === "boolean") data.isHidden = body.isHidden;

  let stagePlanValidation: ReturnType<typeof validateStagePlan> | null = null;
  if (body.stagePlan) {
    const catalogRows = await prisma.stageDefinition.findMany({ where: { isActive: true } });
    const catalog: StagePlanCatalogEntry[] = catalogRows;
    stagePlanValidation = validateStagePlan(body.stagePlan, catalog);
    if (!stagePlanValidation.ok) return apiError(400, stagePlanValidation.error);
  }

  if (body.purchaseOrders) {
    data.totalQty = body.purchaseOrders.reduce((sum, po) => sum + poQty(po.sizes), 0);
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.order.update({ where: { id: orderId }, data });
    }

    if (body.purchaseOrders) {
      const existingPos = await tx.purchaseOrder.findMany({ where: { orderId }, select: { id: true } });
      const existingIds = new Set(existingPos.map((p) => p.id));
      const keepIds = new Set(body.purchaseOrders.filter((po) => po.id).map((po) => po.id));
      const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
      // Cascades to that PO's own size rows, assignments, txns, stage entries,
      // material/accessory requirements, lots and audit log - only reached
      // for a PO the caller explicitly dropped from the list, never a
      // reshuffle of one still present (matched by id below).
      if (toDelete.length > 0) {
        await tx.purchaseOrder.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const po of body.purchaseOrders) {
        const quantity = poQty(po.sizes);
        const poDeliveryDate = po.deliveryDate ? new Date(po.deliveryDate) : null;
        if (po.id && existingIds.has(po.id)) {
          await tx.purchaseOrder.update({
            where: { id: po.id },
            data: { poNumber: po.poNumber.trim(), quantity, extraPercent: po.extraPercent ?? 0, deliveryDate: poDeliveryDate },
          });
          await tx.poSizeQuantity.deleteMany({ where: { poId: po.id } });
          if (po.sizes.length > 0) {
            await tx.poSizeQuantity.createMany({
              data: po.sizes.map((s) => ({ poId: po.id!, sizeCode: s.sizeCode, sortOrder: s.sortOrder, quantity: s.quantity })),
            });
          }
        } else {
          await tx.purchaseOrder.create({
            data: {
              orderId,
              poNumber: po.poNumber.trim(),
              quantity,
              extraPercent: po.extraPercent ?? 0,
              deliveryDate: poDeliveryDate,
              sizeQuantities: { create: po.sizes.map((s) => ({ sizeCode: s.sizeCode, sortOrder: s.sortOrder, quantity: s.quantity })) },
            },
          });
        }
      }
    }

    if (body.stagePlan && stagePlanValidation?.ok) {
      const existingSections = await tx.orderStagePlan.findMany({ where: { orderId }, select: { id: true, stageDefinitionId: true } });
      const existingByStageDefId = new Map(existingSections.map((s) => [s.stageDefinitionId, s.id]));
      const keepStageDefIds = new Set(stagePlanValidation.rows.map((r) => r.stageDefinitionId));
      // Cascades to that section's stage entries, txns, user assignments and
      // audit log rows - only reached for a stage explicitly removed from
      // the plan, never one just reordered (matched by stageDefinitionId).
      const toDeleteSectionIds = existingSections.filter((s) => !keepStageDefIds.has(s.stageDefinitionId)).map((s) => s.id);
      if (toDeleteSectionIds.length > 0) {
        await tx.orderStagePlan.deleteMany({ where: { id: { in: toDeleteSectionIds } } });
      }

      for (const row of stagePlanValidation.rows) {
        const fields = {
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
        const existingId = existingByStageDefId.get(row.stageDefinitionId);
        if (existingId) {
          await tx.orderStagePlan.update({ where: { id: existingId }, data: fields });
        } else {
          await tx.orderStagePlan.create({ data: { orderId, stageDefinitionId: row.stageDefinitionId, ...fields } });
        }
      }
    }
  });

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      image: { select: { id: true, contentType: true } },
      purchaseOrders: { include: { sizeQuantities: { orderBy: { sortOrder: "asc" } } } },
      stagePlan: { orderBy: { seq: "asc" } },
    },
  });

  return NextResponse.json({ order: serializeForJson(full) });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;
  const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { createdBy: true } });
  if (!existing) return apiError(404, "Order not found.");
  if (!(await canManage(auth.session.userId, existing))) {
    return apiError(403, "You don't have permission to delete this order.");
  }

  await prisma.order.delete({ where: { id: orderId } });
  return NextResponse.json({ ok: true });
}
