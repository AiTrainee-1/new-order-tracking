import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdminOrMd } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/**
 * Cross-order accessories view for the admin/MD Accessories Management page.
 * The per-order bundle route is scoped to one order, so this is a separate
 * query rather than N calls to that route.
 */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  // The role check and the four lookups are independent: one round trip, not a chain of them (an `include`
  // would run the order, PO and entries lookups after the requirements, one at a time).
  const [allowed, requirementRows, orders, buyers, pos, entries] = await Promise.all([
    isAdminOrMd(auth.session.userId),
    prisma.accessoryRequirement.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({ where: { accessoryRequirements: { some: {} } }, select: { id: true, ioNo: true, style: true, color: true, buyerId: true } }),
    prisma.buyer.findMany({ select: { id: true, name: true } }),
    prisma.purchaseOrder.findMany({ where: { accessoryRequirements: { some: {} } }, select: { id: true, poNumber: true } }),
    prisma.accessoryEntry.findMany({ orderBy: { entryDate: "asc" } }),
  ]);
  if (!allowed) return apiError(403, "Only Admin and MD accounts can view the accessories summary.");

  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const orderById = new Map(orders.map((o) => [o.id, { id: o.id, ioNo: o.ioNo, style: o.style, color: o.color, buyer: o.buyerId ? (buyerById.get(o.buyerId) ?? null) : null }]));
  const poById = new Map(pos.map((p) => [p.id, p]));
  const entriesByRequirement = new Map<string, typeof entries>();
  for (const e of entries) entriesByRequirement.set(e.requirementId, [...(entriesByRequirement.get(e.requirementId) ?? []), e]);

  const requirements = requirementRows.map((r) => ({
    ...r,
    order: orderById.get(r.orderId),
    po: r.poId ? (poById.get(r.poId) ?? null) : null,
    entries: entriesByRequirement.get(r.id) ?? [],
  }));

  return NextResponse.json({ requirements: serializeForJson(requirements) });
}
