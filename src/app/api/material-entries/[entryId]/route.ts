import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { GroupSyncError, planMaterialEntryChange } from "@/lib/server/orderGroups";

async function loadWithOrder(entryId: string) {
  const entry = await prisma.materialEntry.findUnique({
    where: { id: entryId },
    include: { requirement: { select: { orderId: true, poId: true, name: true } } },
  });
  return entry;
}

export async function PATCH(request: Request, context: RouteContext<"/api/material-entries/[entryId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { entryId } = await context.params;
  const existing = await loadWithOrder(entryId);
  if (!existing) return apiError(404, "Entry not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.requirement.orderId, existing.requirement.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const fields: Record<string, unknown> = {};
  if (body.entryType !== undefined) fields.entryType = body.entryType;
  if (body.qty !== undefined) fields.qty = body.qty;
  if (body.entryDate !== undefined) fields.entryDate = new Date(body.entryDate);
  if (body.supplier !== undefined) fields.supplier = body.supplier;
  if (body.docNo !== undefined) fields.docNo = body.docNo;
  if (body.docDate !== undefined) fields.docDate = body.docDate ? new Date(body.docDate) : null;
  if (body.lotRef !== undefined) fields.lotRef = body.lotRef;
  if (body.notes !== undefined) fields.notes = body.notes;
  const data = { ...fields, updatedBy: auth.session.userId };

  // A correction to an entry written through an Order Group is applied to its
  // copies on the other members (see lib/server/orderGroups.ts).
  let plan;
  try {
    plan = await planMaterialEntryChange(existing, "update", fields, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (plan.rows.length === 0) {
    const updated = await prisma.materialEntry.update({ where: { id: entryId }, data });
    return NextResponse.json({ entry: serializeForJson(updated) });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.materialEntry.update({ where: { id: entryId }, data });
    await tx.materialEntry.updateMany({ where: { id: { in: plan.rows.map((r) => r.id) } }, data });
    await tx.auditLog.createMany({ data: plan.audit });
    return row;
  });
  return NextResponse.json({ entry: serializeForJson(updated), groupSync: plan.sync });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/material-entries/[entryId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { entryId } = await context.params;
  const existing = await loadWithOrder(entryId);
  if (!existing) return apiError(404, "Entry not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.requirement.orderId, existing.requirement.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  let plan;
  try {
    plan = await planMaterialEntryChange(existing, "delete", {}, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (plan.rows.length === 0) {
    await prisma.materialEntry.delete({ where: { id: entryId } });
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.createMany({ data: plan.audit });
    await tx.materialEntry.deleteMany({ where: { id: { in: [entryId, ...plan.rows.map((r) => r.id)] } } });
  });
  return NextResponse.json({ ok: true, groupSync: plan.sync });
}
