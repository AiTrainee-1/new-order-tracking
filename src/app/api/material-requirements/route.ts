import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { planMaterialRequirementCreate } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";
import { materialRequirementCreate, parseBody } from "@/lib/server/validation";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(materialRequirementCreate, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const { orderId, poId } = body;
  if (!(await canEnterMaterials(auth.session.userId, orderId, poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const data = {
    poId,
    category: body.category,
    name: body.name,
    requiredQty: body.requiredQty,
    unit: body.unit,
    supplier: body.supplier,
    sortOrder: body.sortOrder ?? 0,
    isCompleted: !!body.isCompleted,
    notes: body.notes,
    createdBy: auth.session.userId,
    updatedBy: auth.session.userId,
  };

  // In an Order Group the requirement is also created on every other member
  // (see lib/server/orderGroups.ts); otherwise this is the single create it
  // always was.
  const grouped = await groupPlan(planMaterialRequirementCreate(orderId, data, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

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
