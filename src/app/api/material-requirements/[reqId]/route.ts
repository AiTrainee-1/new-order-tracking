import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { GroupSyncError, planMaterialRequirementChange } from "@/lib/server/orderGroups";

export async function PATCH(request: Request, context: RouteContext<"/api/material-requirements/[reqId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { reqId } = await context.params;
  const existing = await prisma.materialRequirement.findUnique({ where: { id: reqId } });
  if (!existing) return apiError(404, "Requirement not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.orderId, existing.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const fields: Record<string, unknown> = {};
  for (const key of ["category", "name", "requiredQty", "unit", "supplier", "sortOrder", "isCompleted", "notes"] as const) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  const data = { ...fields, updatedBy: auth.session.userId };

  // A correction to a requirement written through an Order Group is applied to
  // its copies on the other members (see lib/server/orderGroups.ts).
  let plan;
  try {
    plan = await planMaterialRequirementChange(existing, "update", fields, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (plan.rows.length === 0) {
    const updated = await prisma.materialRequirement.update({ where: { id: reqId }, data });
    return NextResponse.json({ requirement: serializeForJson(updated) });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.materialRequirement.update({ where: { id: reqId }, data });
    await tx.materialRequirement.updateMany({ where: { id: { in: plan.rows.map((r) => r.id) } }, data });
    await tx.auditLog.createMany({ data: plan.audit });
    return row;
  });
  return NextResponse.json({ requirement: serializeForJson(updated), groupSync: plan.sync });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/material-requirements/[reqId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { reqId } = await context.params;
  const existing = await prisma.materialRequirement.findUnique({ where: { id: reqId } });
  if (!existing) return apiError(404, "Requirement not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.orderId, existing.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  let plan;
  try {
    plan = await planMaterialRequirementChange(existing, "delete", {}, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (plan.rows.length === 0) {
    await prisma.materialRequirement.delete({ where: { id: reqId } });
    return NextResponse.json({ ok: true });
  }

  // The same requirement on the other members goes too - with its entries, as
  // always (they are removed with their requirement).
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.createMany({ data: plan.audit });
    await tx.materialRequirement.deleteMany({ where: { id: { in: [reqId, ...plan.rows.map((r) => r.id)] } } });
  });
  return NextResponse.json({ ok: true, groupSync: plan.sync });
}
