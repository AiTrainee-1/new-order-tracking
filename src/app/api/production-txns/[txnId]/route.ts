import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterSection } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { GroupSyncError, planGroupedUpdate, type TxnPatch } from "@/lib/server/orderGroups";

export async function PATCH(request: Request, context: RouteContext<"/api/production-txns/[txnId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { txnId } = await context.params;
  const existing = await prisma.productionTxn.findUnique({ where: { id: txnId } });
  if (!existing) return apiError(404, "Entry not found.");

  const allowed = await canEnterSection(auth.session.userId, existing.orderId, existing.poId, existing.sectionId);
  if (!allowed) return apiError(403, "You don't have write access to this stage.");

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const data: Record<string, unknown> = { updatedBy: auth.session.userId };
  if (body.lotId !== undefined) data.lotId = body.lotId;
  if (body.sizeCode !== undefined) data.sizeCode = body.sizeCode;
  if (body.qtyIn !== undefined) data.qtyIn = body.qtyIn;
  if (body.qtyOut !== undefined) data.qtyOut = body.qtyOut;
  if (body.qtyRejected !== undefined) data.qtyRejected = body.qtyRejected;
  if (body.qtyRework !== undefined) data.qtyRework = body.qtyRework;
  if (body.qtyCount !== undefined) data.qtyCount = body.qtyCount;
  if (body.dcName !== undefined) data.dcName = body.dcName;
  if (body.refName !== undefined) data.refName = body.refName;
  if (body.docNo !== undefined) data.docNo = body.docNo;
  if (body.entryDate !== undefined) data.entryDate = new Date(body.entryDate);

  // A correction to one copy of a grouped entry is applied to every other copy
  // of it (see lib/server/orderGroups.ts). A row that is not part of a group
  // entry - every row of an ungrouped order - has no siblings, and falls
  // straight through to the single update it always was.
  const fields = { ...data };
  delete fields.updatedBy;
  let plan;
  try {
    plan = await planGroupedUpdate(existing, fields as TxnPatch, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

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
