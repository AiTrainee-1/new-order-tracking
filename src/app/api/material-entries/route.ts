import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { GroupSyncError, planMaterialEntryCreate } from "@/lib/server/orderGroups";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const requirementId = typeof body?.requirementId === "string" ? body.requirementId : "";
  if (!requirementId) return apiError(400, "requirementId is required.");

  const requirement = await prisma.materialRequirement.findUnique({ where: { id: requirementId } });
  if (!requirement) return apiError(404, "Requirement not found.");
  if (!(await canEnterMaterials(auth.session.userId, requirement.orderId, requirement.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const data = {
    entryType: body.entryType,
    qty: body.qty,
    entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    supplier: body.supplier ?? null,
    docNo: body.docNo ?? null,
    docDate: body.docDate ? new Date(body.docDate) : null,
    lotRef: body.lotRef ?? null,
    notes: body.notes ?? null,
    enteredBy: auth.session.userId,
  };

  // In an Order Group the entry is also saved against the other members' copy
  // of this requirement (see lib/server/orderGroups.ts).
  let plan;
  try {
    plan = await planMaterialEntryCreate(requirement, body.entryType, data, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (!plan.groupId) {
    const entry = await prisma.materialEntry.create({ data: { requirementId, ...data } });
    return NextResponse.json({ entry: serializeForJson(entry) }, { status: 201 });
  }

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.materialEntry.create({ data: { requirementId, ...data, groupId: plan.groupId, groupLinkId: plan.groupLinkId } });
    await tx.materialEntry.createMany({ data: plan.siblings });
    await tx.auditLog.createMany({ data: plan.audit });
    return created;
  });
  return NextResponse.json({ entry: serializeForJson(entry), groupSync: plan.sync }, { status: 201 });
}
