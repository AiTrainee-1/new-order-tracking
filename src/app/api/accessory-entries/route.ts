import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { parseSizeBreakdown } from "@/lib/accessories";
import { GroupSyncError, planAccessoryEntryCreate } from "@/lib/server/orderGroups";

/** Add a purchase/inward/dispatch entry. Edit/delete live in [entryId]/route.ts. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const requirementId = typeof body?.requirementId === "string" ? body.requirementId : "";
  if (!requirementId) return apiError(400, "requirementId is required.");

  const requirement = await prisma.accessoryRequirement.findUnique({ where: { id: requirementId } });
  if (!requirement) return apiError(404, "Requirement not found.");
  if (!(await canEnterAccessories(auth.session.userId, requirement.orderId, requirement.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  const data = {
    entryType: body.entryType,
    qty: body.qty,
    entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    vendor: body.vendor ?? null,
    docNo: body.docNo ?? null,
    sentTo: body.sentTo ?? null,
    sizeBreakdown: (parseSizeBreakdown(body.sizeBreakdown) as Prisma.InputJsonValue | null) ?? undefined,
    notes: body.notes ?? null,
    enteredBy: auth.session.userId,
  };

  // In an Order Group the entry is also saved against the other members' copy
  // of this accessory (see lib/server/orderGroups.ts).
  let plan;
  try {
    plan = await planAccessoryEntryCreate(requirement, data, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

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
