import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { parseSizeBreakdown } from "@/lib/accessories";

/** Edit a required accessory (name, quantity, unit, date, size breakdown). */
export async function PATCH(request: Request, context: RouteContext<"/api/accessory-requirements/[requirementId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { requirementId } = await context.params;
  const existing = await prisma.accessoryRequirement.findUnique({ where: { id: requirementId }, select: { orderId: true, poId: true } });
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

  const requirement = await prisma.accessoryRequirement.update({ where: { id: requirementId }, data });
  return NextResponse.json({ requirement: serializeForJson(requirement) });
}

/** Delete a required accessory - and, by cascade, every purchase/inward/
 *  dispatch entry recorded against it. The UI asks for confirmation first. */
export async function DELETE(_request: Request, context: RouteContext<"/api/accessory-requirements/[requirementId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { requirementId } = await context.params;
  const existing = await prisma.accessoryRequirement.findUnique({ where: { id: requirementId }, select: { orderId: true, poId: true } });
  if (!existing) return apiError(404, "Accessory not found.");
  if (!(await canEnterAccessories(auth.session.userId, existing.orderId, existing.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  await prisma.accessoryRequirement.delete({ where: { id: requirementId } });
  return NextResponse.json({ ok: true });
}
