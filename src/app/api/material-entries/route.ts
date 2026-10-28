import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, badDateError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { planMaterialEntryCreate } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";
import { materialEntryCreate, parseBody } from "@/lib/server/validation";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(materialEntryCreate, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const { requirementId } = body;

  const requirement = await prisma.materialRequirement.findUnique({ where: { id: requirementId } });
  if (!requirement) return apiError(404, "Requirement not found.");
  if (!(await canEnterMaterials(auth.session.userId, requirement.orderId, requirement.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const badDate = badDateError(["entry date", body.entryDate], ["document date", body.docDate]);
  if (badDate) return badDate;

  const data = {
    entryType: body.entryType,
    qty: body.qty,
    entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    supplier: body.supplier,
    docNo: body.docNo,
    docDate: body.docDate ? new Date(body.docDate) : null,
    lotRef: body.lotRef,
    notes: body.notes,
    enteredBy: auth.session.userId,
  };

  // In an Order Group the entry is also saved against the other members' copy
  // of this requirement (see lib/server/orderGroups.ts).
  const grouped = await groupPlan(planMaterialEntryCreate(requirement, body.entryType, data, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

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
