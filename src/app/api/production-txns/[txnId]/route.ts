import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { badDateMessage, isSaneDate } from "@/lib/dateInput";
import { canEnterSection, sectionsBelongToOrders } from "@/lib/server/authz";
import { parseBody, txnPatch } from "@/lib/server/validation";
import { serializeForJson } from "@/lib/server/serialize";
import { planGroupedUpdate, type TxnPatch } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";

export async function PATCH(request: Request, context: RouteContext<"/api/production-txns/[txnId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { txnId } = await context.params;
  const existing = await prisma.productionTxn.findUnique({ where: { id: txnId } });
  if (!existing) return apiError(404, "Entry not found.");

  const allowed = await canEnterSection(auth.session.userId, existing.orderId, existing.poId, existing.sectionId);
  if (!allowed) return apiError(403, "You don't have write access to this stage.");

  const parsed = parseBody(txnPatch, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  if (body.entryDate !== undefined && !isSaneDate(body.entryDate)) return apiError(400, badDateMessage(body.entryDate, "entry date"));
  if (body.lotId && !(await sectionsBelongToOrders([{ ...existing, lotId: body.lotId }]))) {
    return apiError(400, "That lot belongs to a different order.");
  }

  const data: Record<string, unknown> = { updatedBy: auth.session.userId };
  for (const key of ["lotId", "sizeCode", "qtyIn", "qtyOut", "qtyRejected", "qtyRework", "qtyCount", "dcName", "refName", "docNo"] as const) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.entryDate !== undefined) data.entryDate = new Date(body.entryDate);

  // A correction to one copy of a grouped entry is applied to every other copy
  // of it (see lib/server/orderGroups.ts). A row that is not part of a group
  // entry - every row of an ungrouped order - has no siblings, and falls
  // straight through to the single update it always was.
  const fields = { ...data };
  delete fields.updatedBy;
  const grouped = await groupPlan(planGroupedUpdate(existing, fields as TxnPatch, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

  if (plan.siblings.length === 0) {
    const updated = await prisma.productionTxn.update({ where: { id: txnId }, data });
    return NextResponse.json({ txn: serializeForJson(updated) });
  }

  // One transaction: every copy is corrected, or none is. Copies that get the
  // very same change are updated in a single statement.
  const updated = await prisma.$transaction(async (tx) => {
    if (plan.lotCreates.length > 0) await tx.productionLot.createMany({ data: plan.lotCreates });
    const row = await tx.productionTxn.update({ where: { id: txnId }, data });
    const byChange = new Map<string, { ids: string[]; data: Record<string, unknown> }>();
    for (const s of plan.siblings) {
      const key = JSON.stringify(s.data);
      const group = byChange.get(key) ?? { ids: [], data: s.data };
      group.ids.push(s.id);
      byChange.set(key, group);
    }
    for (const group of byChange.values()) {
      await tx.productionTxn.updateMany({ where: { id: { in: group.ids } }, data: { ...group.data, updatedBy: auth.session.userId } });
    }
    if (plan.audit.length > 0) await tx.auditLog.createMany({ data: plan.audit });
    return row;
  });

  return NextResponse.json({ txn: serializeForJson(updated), groupSync: plan.sync });
}
