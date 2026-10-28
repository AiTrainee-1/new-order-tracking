import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { badDateMessage, isSaneDate } from "@/lib/dateInput";
import { canEnterSections, canViewOrder, canViewOrders, isAdminOrMd } from "@/lib/server/authz";
import { parseBody, stageEntryBody } from "@/lib/server/validation";
import { serializeForJson } from "@/lib/server/serialize";
import { planGroupedStageEntries } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";
import { syncTnaForOrder } from "@/lib/server/tna";

/** ?orderIds= is a URL list, so it is bounded - far above any one user's assigned orders. */
const MAX_ORDER_IDS = 500;

/** Supports: ?orderId= (all entries for one order), ?orderId=&sectionId=
 *  (recent 20, for one stage), or ?orderIds=a,b,c (bulk, for the "my work"
 *  gating computation across every order a user has an assignment on). */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const orderId = request.nextUrl.searchParams.get("orderId");
  const sectionId = request.nextUrl.searchParams.get("sectionId");
  const orderIdsParam = request.nextUrl.searchParams.get("orderIds");

  // ?scope=visible - every entry on every order that is not hidden: what the fleet dashboard builds its
  // progress from. Naming no order ids means it does not have to wait for the orders list to know which
  // ids to ask for, so the two requests run at the same time. Admin and MD only (it spans every order).
  if (request.nextUrl.searchParams.get("scope") === "visible") {
    if (!(await isAdminOrMd(auth.session.userId))) return apiError(403, "Only Admin and MD accounts can load every order's entries.");
    const entries = await prisma.stageEntry.findMany({ where: { order: { isHidden: false } } });
    return NextResponse.json({ entries: serializeForJson(entries) });
  }

  if (orderIdsParam) {
    const orderIds = Array.from(new Set(orderIdsParam.split(",").filter(Boolean)));
    if (orderIds.length > MAX_ORDER_IDS) return apiError(400, `At most ${MAX_ORDER_IDS} orders can be loaded at once.`);
    if (!(await canViewOrders(auth.session.userId, orderIds))) return apiError(403, "You can't view one or more of these orders.");
    const entries = await prisma.stageEntry.findMany({ where: { orderId: { in: orderIds } } });
    return NextResponse.json({ entries: serializeForJson(entries) });
  }

  if (!orderId) return apiError(400, "orderId or orderIds is required.");
  if (!(await canViewOrder(auth.session.userId, orderId))) return apiError(404, "Order not found.");

  if (sectionId) {
    const entries = await prisma.stageEntry.findMany({
      where: { orderId, sectionId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ entries: serializeForJson(entries) });
  }

  const entries = await prisma.stageEntry.findMany({
    where: { orderId },
    orderBy: { entryDate: "asc" },
  });
  return NextResponse.json({ entries: serializeForJson(entries) });
}

// Group mirroring (planGroupedStageEntries) hands rows back with the enum fields widened to string.
type StageEntryInput = Omit<z.output<typeof stageEntryBody>[number], "unitType" | "transferType"> & { unitType: string; transferType: string };

function toCreateData(input: StageEntryInput, userId: string) {
  return {
    orderId: input.orderId,
    poId: input.poId,
    sectionId: input.sectionId,
    entryDate: new Date(input.entryDate),
    unitType: input.unitType as never,
    qtyReceived: input.qtyReceived,
    qtyCompletedToday: input.qtyCompletedToday,
    qtyForwarded: input.qtyForwarded,
    qtyShortage: input.qtyShortage,
    qtyRejected: input.qtyRejected,
    qtyReturned: input.qtyReturned,
    isExternal: input.isExternal,
    externalUnitName: input.externalUnitName,
    isSentOutside: input.isSentOutside,
    isReturned: input.isReturned,
    isForwarded: input.isForwarded,
    isCompleted: input.isCompleted,
    branch: input.branch,
    unitName: input.unitName,
    transferType: input.transferType as never,
    transferTo: input.transferTo,
    notes: input.notes,
    enteredBy: userId,
    forwardedToUserId: input.forwardedToUserId,
  };
}

/** Accepts either one entry ({ entry }) or a batch ({ entries }) - the batch
 *  form is used when a stage's quantity is split across several units/
 *  branches/outside parties, each split getting its own auditable row. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(stageEntryBody, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const inputs = parsed.data;
  if (inputs.length === 0) return apiError(400, "At least one entry is required.");
  const badInput = inputs.find((i) => !isSaneDate(i.entryDate));
  if (badInput) return apiError(400, badDateMessage(badInput.entryDate, "entry date"));

  // Every row's order/PO/stage is checked, not just the first one's.
  const allowed = await canEnterSections(auth.session.userId, inputs);
  if (!allowed) return apiError(403, "You don't have write access to this stage.");

  // Order Confirmation and Pattern Making have no ledger of their own - their
  // stage entry IS the data - so in a group the entry is mirrored onto the other
  // members (see lib/server/orderGroups.ts). For every other stage, and for any
  // ungrouped order, the entries come back exactly as they went in.
  const grouped = await groupPlan(planGroupedStageEntries(inputs, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

  const withGroup = (input: (typeof plan.rows)[number]) => ({ ...toCreateData(input, auth.session.userId), groupId: input.groupId, groupLinkId: input.groupLinkId });
  const created = plan.sync
    ? await prisma.$transaction(async (tx) => {
        // Every order's copy in one statement, then the audit rows in another.
        const all = await tx.stageEntry.createManyAndReturn({ data: plan.rows.map(withGroup) });
        if (plan.audit.length > 0) await tx.auditLog.createMany({ data: plan.audit });
        return all.filter((e) => e.orderId === plan.rows[0].orderId);
      })
    : await prisma.$transaction(plan.rows.map((input) => prisma.stageEntry.create({ data: withGroup(input) })));

  await prisma.appUser.update({
    where: { id: auth.session.userId },
    data: { lastActivityAt: new Date() },
  });

  // TNA (Time & Action) watches stage completions from the side: when this save
  // completed a stage, let it record the moment. It reads production data and
  // writes only its own tables, and cannot throw - the save above is already done.
  if (plan.rows.some((r) => r.isCompleted)) {
    await Promise.all([...new Set(plan.rows.map((r) => r.orderId))].map((id) => syncTnaForOrder(id)));
  }

  return NextResponse.json({ entries: serializeForJson(created), ...(plan.sync ? { groupSync: plan.sync } : {}) }, { status: 201 });
}
