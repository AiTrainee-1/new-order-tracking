import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { GroupSyncError, planMaterialRequirementCreate } from "@/lib/server/orderGroups";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const poId = typeof body?.poId === "string" ? body.poId : null;
  if (!orderId) return apiError(400, "orderId is required.");
  if (!(await canEnterMaterials(auth.session.userId, orderId, poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const data = {
    poId,
    category: body.category,
    name: body.name,
    requiredQty: body.requiredQty,
    unit: body.unit,
    supplier: body.supplier ?? null,
    sortOrder: body.sortOrder ?? 0,
    isCompleted: !!body.isCompleted,
    notes: body.notes ?? null,
    createdBy: auth.session.userId,
    updatedBy: auth.session.userId,
  };

  // In an Order Group the requirement is also created on every other member
  // (see lib/server/orderGroups.ts); otherwise this is the single create it
  // always was.
  let plan;
  try {
    plan = await planMaterialRequirementCreate(orderId, data, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  if (!plan.groupId) {
    const requirement = await prisma.materialRequirement.create({ data: { orderId, ...data } });
    return NextResponse.json({ requirement: serializeForJson(requirement) }, { status: 201 });
  }

  const requirement = await prisma.$transaction(async (tx) => {
    const created = await tx.materialRequirement.create({ data: { orderId, ...data, groupId: plan.groupId, groupLinkId: plan.groupLinkId } });
    await tx.materialRequirement.createMany({ data: plan.siblings });
    await tx.auditLog.createMany({ data: plan.audit });
    return created;
  });
  return NextResponse.json({ requirement: serializeForJson(requirement), groupSync: plan.sync }, { status: 201 });
}
