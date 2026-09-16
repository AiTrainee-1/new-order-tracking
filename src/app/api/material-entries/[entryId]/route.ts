import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

async function loadWithOrder(entryId: string) {
  const entry = await prisma.materialEntry.findUnique({
    where: { id: entryId },
    include: { requirement: { select: { orderId: true, poId: true } } },
  });
  return entry;
}

export async function PATCH(request: Request, context: RouteContext<"/api/material-entries/[entryId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { entryId } = await context.params;
  const existing = await loadWithOrder(entryId);
  if (!existing) return apiError(404, "Entry not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.requirement.orderId, existing.requirement.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const data: Record<string, unknown> = { updatedBy: auth.session.userId };
  if (body.entryType !== undefined) data.entryType = body.entryType;
  if (body.qty !== undefined) data.qty = body.qty;
  if (body.entryDate !== undefined) data.entryDate = new Date(body.entryDate);
  if (body.supplier !== undefined) data.supplier = body.supplier;
  if (body.docNo !== undefined) data.docNo = body.docNo;
  if (body.docDate !== undefined) data.docDate = body.docDate ? new Date(body.docDate) : null;
  if (body.lotRef !== undefined) data.lotRef = body.lotRef;
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.materialEntry.update({ where: { id: entryId }, data });
  return NextResponse.json({ entry: serializeForJson(updated) });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/material-entries/[entryId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { entryId } = await context.params;
  const existing = await loadWithOrder(entryId);
  if (!existing) return apiError(404, "Entry not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.requirement.orderId, existing.requirement.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  await prisma.materialEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
