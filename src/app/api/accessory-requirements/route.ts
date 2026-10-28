import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, badDateError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { parseSizeBreakdown } from "@/lib/accessories";
import { planAccessoryRequirementCreate } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";
import { accessoryRequirementCreate, parseBody } from "@/lib/server/validation";

/** Add a required accessory. Edit/delete live in [requirementId]/route.ts. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(accessoryRequirementCreate, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const { orderId, poId, unit } = body;
  if (!(await canEnterAccessories(auth.session.userId, orderId, poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  const badDate = badDateError(["required date", body.requiredDate]);
  if (badDate) return badDate;

  const data = {
    poId,
    name: body.name,
    requiredQty: body.requiredQty,
    unit,
    requiredDate: body.requiredDate ? new Date(body.requiredDate) : null,
    sortOrder: body.sortOrder ?? 0,
    // Matches AuditLog.changes' own precedent for a Json? field: `?? undefined`
    // (omit the key), not `?? null` - avoids this generator's inconsistent
    // handling of an explicit JSON null on optional Json columns.
    sizeBreakdown: (parseSizeBreakdown(body.sizeBreakdown) as Prisma.InputJsonValue | null) ?? undefined,
    notes: body.notes,
    createdBy: auth.session.userId,
  };

  // In an Order Group the accessory is also added to every other member (see
  // lib/server/orderGroups.ts); otherwise this is the single create it always was.
  const grouped = await groupPlan(planAccessoryRequirementCreate(orderId, data, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

  if (!plan.groupId) {
    const requirement = await prisma.accessoryRequirement.create({ data: { orderId, ...data } });
    return NextResponse.json({ requirement: serializeForJson(requirement) }, { status: 201 });
  }

  const requirement = await prisma.$transaction(async (tx) => {
    const created = await tx.accessoryRequirement.create({ data: { orderId, ...data, groupId: plan.groupId, groupLinkId: plan.groupLinkId } });
    await tx.accessoryRequirement.createMany({ data: plan.siblings });
    await tx.auditLog.createMany({ data: plan.audit });
    return created;
  });
  return NextResponse.json({ requirement: serializeForJson(requirement), groupSync: plan.sync }, { status: 201 });
}
