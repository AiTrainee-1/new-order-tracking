import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, badDateError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { parseSizeBreakdown } from "@/lib/accessories";
import { planAccessoryEntryCreate } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";
import { accessoryEntryCreate, parseBody } from "@/lib/server/validation";

/** Add a purchase/inward/dispatch entry. Edit/delete live in [entryId]/route.ts. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(accessoryEntryCreate, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const { requirementId } = body;

  const requirement = await prisma.accessoryRequirement.findUnique({ where: { id: requirementId } });
  if (!requirement) return apiError(404, "Requirement not found.");
  if (!(await canEnterAccessories(auth.session.userId, requirement.orderId, requirement.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  const badDate = badDateError(["entry date", body.entryDate]);
  if (badDate) return badDate;

  const data = {
    entryType: body.entryType,
    qty: body.qty,
    entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    vendor: body.vendor,
    docNo: body.docNo,
    sentTo: body.sentTo,
    sizeBreakdown: (parseSizeBreakdown(body.sizeBreakdown) as Prisma.InputJsonValue | null) ?? undefined,
    notes: body.notes,
    enteredBy: auth.session.userId,
  };

  // In an Order Group the entry is also saved against the other members' copy
  // of this accessory (see lib/server/orderGroups.ts).
  const grouped = await groupPlan(planAccessoryEntryCreate(requirement, data, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

  if (!plan.groupId) {
    const entry = await prisma.accessoryEntry.create({ data: { requirementId, ...data } });
    return NextResponse.json({ entry: serializeForJson(entry) }, { status: 201 });
  }

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.accessoryEntry.create({ data: { requirementId, ...data, groupId: plan.groupId, groupLinkId: plan.groupLinkId } });
    await tx.accessoryEntry.createMany({ data: plan.siblings });
    await tx.auditLog.createMany({ data: plan.audit });
    return created;
  });
  return NextResponse.json({ entry: serializeForJson(entry), groupSync: plan.sync }, { status: 201 });
}
