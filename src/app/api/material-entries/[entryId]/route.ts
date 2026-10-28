import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, badDateError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { planMaterialEntryChange } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";
import { materialEntryPatch, parseBody } from "@/lib/server/validation";

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

  const badDate = badDateError(["entry date", body.entryDate], ["document date", body.docDate]);
  if (badDate) return badDate;

  const patch = parseBody(materialEntryPatch, body);
  if ("error" in patch) return patch.error;
  const { entryDate, docDate, ...rest } = patch.data;
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) fields[key] = value;
  }
  if (entryDate) fields.entryDate = new Date(entryDate);
  if (docDate !== undefined) fields.docDate = docDate ? new Date(docDate) : null;
  const data = { ...fields, updatedBy: auth.session.userId };

  // A correction to an entry written through an Order Group is applied to its
  // copies on the other members (see lib/server/orderGroups.ts).
  const grouped = await groupPlan(planMaterialEntryChange(existing, "update", fields, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

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

  const grouped = await groupPlan(planMaterialEntryChange(existing, "delete", {}, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

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
