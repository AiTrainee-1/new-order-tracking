import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { parseSizeBreakdown } from "@/lib/accessories";
import { GroupSyncError, planAccessoryRequirementChange } from "@/lib/server/orderGroups";

/** Edit a required accessory (name, quantity, unit, date, size breakdown). */
export async function PATCH(request: Request, context: RouteContext<"/api/accessory-requirements/[requirementId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { requirementId } = await context.params;
  const existing = await prisma.accessoryRequirement.findUnique({ where: { id: requirementId } });
  if (!existing) return apiError(404, "Accessory not found.");
  if (!(await canEnterAccessories(auth.session.userId, existing.orderId, existing.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const data: Prisma.AccessoryRequirementUpdateInput = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return apiError(400, "Enter an accessory name.");
    data.name = name;
  }
  if (body.requiredQty !== undefined) {
    const qty = Number(body.requiredQty);
    if (!Number.isFinite(qty) || qty < 0) return apiError(400, "Enter a valid quantity.");
    data.requiredQty = qty;
  }
  if (body.unit !== undefined) {
    const unit = typeof body.unit === "string" ? body.unit.trim() : "";
    if (!unit) return apiError(400, "unit is required.");
    data.unit = unit;
  }
  if (body.requiredDate !== undefined) data.requiredDate = body.requiredDate ? new Date(body.requiredDate) : null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.sizeBreakdown !== undefined) {
    const parsed = parseSizeBreakdown(body.sizeBreakdown);
    data.sizeBreakdown = (parsed as Prisma.InputJsonValue | null) ?? Prisma.DbNull;
  }

  // A correction to an accessory written through an Order Group is applied to
  // its copies on the other members (see lib/server/orderGroups.ts).
  let plan;
  try {
    plan = await planAccessoryRequirementChange(existing, "update", data as Record<string, unknown>, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (plan.rows.length === 0) {
    const requirement = await prisma.accessoryRequirement.update({ where: { id: requirementId }, data });
    return NextResponse.json({ requirement: serializeForJson(requirement) });
  }

  const requirement = await prisma.$transaction(async (tx) => {
    const row = await tx.accessoryRequirement.update({ where: { id: requirementId }, data });
    await tx.accessoryRequirement.updateMany({ where: { id: { in: plan.rows.map((r) => r.id) } }, data });
    await tx.auditLog.createMany({ data: plan.audit });
    return row;
  });
  return NextResponse.json({ requirement: serializeForJson(requirement), groupSync: plan.sync });
}

/** Delete a required accessory - and, by cascade, every purchase/inward/
 *  dispatch entry recorded against it. The UI asks for confirmation first. */
export async function DELETE(_request: Request, context: RouteContext<"/api/accessory-requirements/[requirementId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { requirementId } = await context.params;
  const existing = await prisma.accessoryRequirement.findUnique({ where: { id: requirementId } });
  if (!existing) return apiError(404, "Accessory not found.");
  if (!(await canEnterAccessories(auth.session.userId, existing.orderId, existing.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  let plan;
  try {
    plan = await planAccessoryRequirementChange(existing, "delete", {}, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (plan.rows.length === 0) {
    await prisma.accessoryRequirement.delete({ where: { id: requirementId } });
    return NextResponse.json({ ok: true });
  }

  // The same accessory on the other members goes too, with its entries.
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.createMany({ data: plan.audit });
    await tx.accessoryRequirement.deleteMany({ where: { id: { in: [requirementId, ...plan.rows.map((r) => r.id)] } } });
  });
  return NextResponse.json({ ok: true, groupSync: plan.sync });
}
