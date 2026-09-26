import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { parseSizeBreakdown } from "@/lib/accessories";

const ENTRY_TYPES = ["purchase", "inward", "dispatch"];

function loadWithOrder(entryId: string) {
  return prisma.accessoryEntry.findUnique({
    where: { id: entryId },
    include: { requirement: { select: { orderId: true, poId: true } } },
  });
}

/** Correct a saved purchase/inward/dispatch entry. Same permission as adding
 *  one. The parent accessory can't be changed - an entry that belongs under
 *  a different accessory should be deleted and re-entered there. */
export async function PATCH(request: Request, context: RouteContext<"/api/accessory-entries/[entryId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { entryId } = await context.params;
  const existing = await loadWithOrder(entryId);
  if (!existing) return apiError(404, "Entry not found.");
  if (!(await canEnterAccessories(auth.session.userId, existing.requirement.orderId, existing.requirement.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const data: Prisma.AccessoryEntryUpdateInput = {};
  if (body.entryType !== undefined) {
    if (!ENTRY_TYPES.includes(body.entryType)) return apiError(400, "Invalid entry type.");
    data.entryType = body.entryType;
  }
  if (body.qty !== undefined) {
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) return apiError(400, "Enter a quantity greater than zero.");
    data.qty = qty;
  }
  if (body.entryDate !== undefined && body.entryDate) data.entryDate = new Date(body.entryDate);
  if (body.vendor !== undefined) data.vendor = body.vendor || null;
  if (body.docNo !== undefined) data.docNo = body.docNo || null;
  if (body.sentTo !== undefined) data.sentTo = body.sentTo || null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.sizeBreakdown !== undefined) {
    const parsed = parseSizeBreakdown(body.sizeBreakdown);
    data.sizeBreakdown = (parsed as Prisma.InputJsonValue | null) ?? Prisma.DbNull;
  }

  const entry = await prisma.accessoryEntry.update({ where: { id: entryId }, data });
  return NextResponse.json({ entry: serializeForJson(entry) });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/accessory-entries/[entryId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { entryId } = await context.params;
  const existing = await loadWithOrder(entryId);
  if (!existing) return apiError(404, "Entry not found.");
  if (!(await canEnterAccessories(auth.session.userId, existing.requirement.orderId, existing.requirement.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  await prisma.accessoryEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
