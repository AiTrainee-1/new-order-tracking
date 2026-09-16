import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterSection } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

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
  if (body.refName !== undefined) data.refName = body.refName;
  if (body.docNo !== undefined) data.docNo = body.docNo;
  if (body.entryDate !== undefined) data.entryDate = new Date(body.entryDate);

  const updated = await prisma.productionTxn.update({ where: { id: txnId }, data });
  return NextResponse.json({ txn: serializeForJson(updated) });
}
