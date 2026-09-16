import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canViewOrder } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/**
 * All four production ledgers for one order, fetched together - mirrors the
 * old app's fetchBundle() in useProductionChain.ts. Loaded as a single
 * bundle because the chain calculation is inherently whole-order: Packing's
 * balance depends on Sewing's output, which depends on Cutting's, and so on.
 */
export async function GET(_request: Request, context: RouteContext<"/api/orders/[orderId]/bundle">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;
  if (!(await canViewOrder(auth.session.userId, orderId))) {
    return apiError(403, "You don't have access to this order.");
  }

  const purchaseOrders = await prisma.purchaseOrder.findMany({ where: { orderId }, select: { id: true } });
  const poIds = purchaseOrders.map((p) => p.id);

  const [sizes, lots, requirements, txns] = await Promise.all([
    poIds.length
      ? prisma.poSizeQuantity.findMany({ where: { poId: { in: poIds } } })
      : Promise.resolve([]),
    prisma.productionLot.findMany({ where: { orderId } }),
    prisma.materialRequirement.findMany({ where: { orderId } }),
    prisma.productionTxn.findMany({ where: { orderId } }),
  ]);

  const materialEntries = requirements.length
    ? await prisma.materialEntry.findMany({ where: { requirementId: { in: requirements.map((r) => r.id) } } })
    : [];

  return NextResponse.json({
    bundle: serializeForJson({ sizes, lots, requirements, materialEntries, txns }),
  });
}
