import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, badDateError } from "@/lib/server/http";
import { canViewOrder, isAdmin } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { validateStagePlan, type StagePlanCatalogEntry } from "@/lib/stagePlan";
import { parseBody } from "@/lib/server/validation";
import { hasProductionHistory, orderUpdateBody, poQuantity, stagePlanFields } from "@/lib/server/orderInput";

export async function GET(_request: Request, context: RouteContext<"/api/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;
  // Not-yours answers the same as not-there, so an order id can't be probed.
  if (!(await canViewOrder(auth.session.userId, orderId))) return apiError(404, "Order not found.");

  // Everything about the order is looked up by its id at the same time (an `include` would run the pieces one
  // after another, a database round trip apiece).
  const [row, buyer, image, purchaseOrders, sizeRows, stagePlan] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId } }),
    prisma.buyer.findFirst({ where: { orders: { some: { id: orderId } } }, select: { id: true, name: true } }),
    prisma.orderImage.findFirst({ where: { order: { id: orderId } }, select: { id: true, contentType: true } }),
    prisma.purchaseOrder.findMany({ where: { orderId }, orderBy: [{ createdAt: "asc" }, { poNumber: "asc" }] }),
    prisma.poSizeQuantity.findMany({ where: { purchaseOrder: { orderId } }, orderBy: { sortOrder: "asc" } }),
    prisma.orderStagePlan.findMany({ where: { orderId }, orderBy: { seq: "asc" } }),
  ]);

  if (!row) return apiError(404, "Order not found.");
  const sizesByPo = new Map<string, typeof sizeRows>();
  for (const sq of sizeRows) sizesByPo.set(sq.poId, [...(sizesByPo.get(sq.poId) ?? []), sq]);
  const order = {
    ...row,
    buyer: buyer ?? null,
    image: image ?? null,
    purchaseOrders: purchaseOrders.map((po) => ({ ...po, sizeQuantities: sizesByPo.get(po.id) ?? [] })),
    stagePlan,
  };

  if (order.isHidden) {
    const allowed = order.createdBy === auth.session.userId || (await isAdmin(auth.session.userId));
    if (!allowed) return apiError(404, "Order not found.");
  }

  return NextResponse.json({ order: serializeForJson(order) });
}

/** A destructive edit refused because production is recorded under it - answered as a 409. */
class HistoryError extends Error {}

/** Only Admin, or the floor user who created the order, may hide/unhide or
 *  delete it - "create, and manage what you created, not what it's used for
 *  afterward" (see CreateOrderPage's module comment). */
async function canManage(userId: string, order: { createdBy: string | null }): Promise<boolean> {
  if (order.createdBy === userId) return true;
  return isAdmin(userId);
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

  const parsed = parseBody(orderUpdateBody, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const badDate = badDateError(["delivery date", body.deliveryDate], ...(body.purchaseOrders ?? []).map((po): [string, unknown] => [`delivery date of PO ${po.poNumber}`, po.deliveryDate]));
  if (badDate) return badDate;

  const data: Record<string, unknown> = {};
  if (body.ioNo !== undefined) data.ioNo = body.ioNo;
  if (body.style !== undefined) data.style = body.style;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.color !== undefined) data.color = body.color || null;
  if (body.fabric !== undefined) data.fabric = body.fabric || null;
  if (body.buyerId !== undefined) {
    if (body.buyerId && !(await prisma.buyer.findUnique({ where: { id: body.buyerId }, select: { id: true } }))) {
      return apiError(400, "That buyer no longer exists - pick another or add it again.");
    }
    data.buyerId = body.buyerId || null;
  }
  if (body.deliveryDate !== undefined) data.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
  if (body.imageId !== undefined) {
    if (body.imageId && !(await prisma.orderImage.findUnique({ where: { id: body.imageId }, select: { id: true } }))) {
      return apiError(400, "That image is no longer available - upload it again.");
    }
    data.imageId = body.imageId || null;
  }
  if (typeof body.isHidden === "boolean") data.isHidden = body.isHidden;

  let stagePlanValidation: ReturnType<typeof validateStagePlan> | null = null;
  if (body.stagePlan) {
    const catalogRows = await prisma.stageDefinition.findMany({ where: { isActive: true } });
    const catalog: StagePlanCatalogEntry[] = catalogRows;
    stagePlanValidation = validateStagePlan(body.stagePlan, catalog);
    if (!stagePlanValidation.ok) return apiError(400, stagePlanValidation.error);
  }

  if (body.purchaseOrders) {
    data.totalQty = body.purchaseOrders.reduce((sum, po) => sum + poQuantity(po), 0);
  }

  // Dropping a PO or a stage cascades away everything recorded under it - other people's entries and the
  // audit rows about them. The creator may reshape an order nobody has worked on yet; once production is
  // recorded there, only an Admin may drop it, and the drop itself goes on the order's audit trail.
  const admin = await isAdmin(auth.session.userId);
  try {
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
          if (await hasProductionHistory(tx, { poIds: toDelete })) {
            if (!admin) throw new HistoryError("Production has been recorded on a PO you removed - only an Admin can remove it.");
            const dropped = await tx.purchaseOrder.findMany({ where: { id: { in: toDelete } }, select: { poNumber: true } });
            await tx.auditLog.create({
              data: {
                orderId,
                entity: "purchase_order",
                action: "delete",
                summary: `Removed PO ${dropped.map((p) => p.poNumber).join(", ")} and everything recorded under it`,
                userId: auth.session.userId,
              },
            });
          }
          await tx.purchaseOrder.deleteMany({ where: { id: { in: toDelete } } });
        }

        for (const po of body.purchaseOrders) {
          const quantity = poQuantity(po);
          const poDeliveryDate = po.deliveryDate ? new Date(po.deliveryDate) : null;
          if (po.id && existingIds.has(po.id)) {
            await tx.purchaseOrder.update({
              where: { id: po.id },
              data: { poNumber: po.poNumber, quantity, extraPercent: po.extraPercent ?? 0, deliveryDate: poDeliveryDate },
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
                poNumber: po.poNumber,
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
          if (await hasProductionHistory(tx, { sectionIds: toDeleteSectionIds })) {
            if (!admin) throw new HistoryError("Production has been recorded on a stage you removed - only an Admin can remove it.");
            const dropped = await tx.orderStagePlan.findMany({ where: { id: { in: toDeleteSectionIds } }, select: { label: true } });
            await tx.auditLog.create({
              data: {
                orderId,
                entity: "stage",
                action: "delete",
                summary: `Removed stage ${dropped.map((d) => d.label).join(", ")} and everything recorded under it`,
                userId: auth.session.userId,
              },
            });
          }
          // A stage leaving the plan also leaves any Order Group it was in. Left behind, the link would make
          // every grouped save at that stage on the OTHER orders fail ("no longer has this stage in its plan").
          const droppedKeys = (await tx.orderStagePlan.findMany({ where: { id: { in: toDeleteSectionIds } }, select: { key: true } })).map((s) => s.key);
          const staleLinks = await tx.orderGroupLink.findMany({ where: { orderId, stageKey: { in: droppedKeys } }, select: { id: true, stageKey: true, group: { select: { name: true } } } });
          if (staleLinks.length > 0) {
            await tx.orderGroupLink.deleteMany({ where: { id: { in: staleLinks.map((l) => l.id) } } });
            await tx.auditLog.create({
              data: {
                orderId,
                entity: "order_group",
                action: "update",
                summary: `Left ${staleLinks.map((l) => `group "${l.group.name}" for ${l.stageKey.replace(/_/g, " ")}`).join(", ")} - the stage was removed from this order's plan`,
                userId: auth.session.userId,
              },
            });
          }
          await tx.orderStagePlan.deleteMany({ where: { id: { in: toDeleteSectionIds } } });
        }

        // Phase 1: move every kept, already-existing row out of the 1..N range
        // first. Reordering can ask for a seq another kept row still occupies -
        // (orderId, seq) is a real unique index Postgres checks immediately
        // per statement, not deferred to commit - so writing final seqs
        // directly can collide mid-loop even though the end state is valid.
        // Negative values can never collide with a real position or each other.
        let tempSeq = -1;
        for (const row of stagePlanValidation.rows) {
          const existingId = existingByStageDefId.get(row.stageDefinitionId);
          if (existingId) {
            await tx.orderStagePlan.update({ where: { id: existingId }, data: { seq: tempSeq } });
            tempSeq -= 1;
          }
        }

        // Phase 2: every kept row is now safely outside 1..N, so real fields -
        // including the final seq - can be written without colliding with a
        // row still waiting its turn.
        for (const row of stagePlanValidation.rows) {
          const fields = stagePlanFields(row);
          const existingId = existingByStageDefId.get(row.stageDefinitionId);
          if (existingId) {
            await tx.orderStagePlan.update({ where: { id: existingId }, data: fields });
          } else {
            await tx.orderStagePlan.create({ data: { orderId, stageDefinitionId: row.stageDefinitionId, ...fields } });
          }
        }
      }
    }, {
      // A full edit reconciles every PO and every stage row one at a time (see
      // the module comment on preserving ids), each its own round trip to a
      // remote database - Prisma's 5s default interactive-transaction timeout
      // is comfortably too short for a large order (20+ stages, several POs),
      // so this raises it rather than trying to parallelize writes whose order
      // matters (deletes before creates, so freed (orderId, seq) slots don't
      // collide with a row being inserted into them).
      timeout: 30000,
    });
  } catch (error) {
    if (error instanceof HistoryError) return apiError(409, error.message);
    throw error;
  }

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: { select: { id: true, name: true } },
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
  // Deleting the order takes every entry on it (and its audit trail) with it: the creator may delete an order
  // nobody has worked on; once production is recorded, only an Admin may.
  if (!(await isAdmin(auth.session.userId)) && (await hasProductionHistory(prisma, { orderId }))) {
    return apiError(409, "Production has been recorded on this order - only an Admin can delete it. You can hide it instead.");
  }

  await prisma.order.delete({ where: { id: orderId } });
  return NextResponse.json({ ok: true });
}
