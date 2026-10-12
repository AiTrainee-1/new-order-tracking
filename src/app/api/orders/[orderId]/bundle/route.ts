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

  // The permission check and every ledger are independent, so they all go out at once: one round trip to the
  // database instead of four in a row (the entries are found through their requirement's order, so they no
  // longer wait for the requirements to come back). Someone who may not see the order gets the 403 and the
  // rows are simply dropped.
  const [allowed, sizes, lots, requirements, txns, accessoryRequirements, materialEntries, accessoryEntries] = await Promise.all([
    canViewOrder(auth.session.userId, orderId),
    prisma.poSizeQuantity.findMany({ where: { purchaseOrder: { orderId } } }),
    prisma.productionLot.findMany({ where: { orderId } }),
    prisma.materialRequirement.findMany({ where: { orderId } }),
    prisma.productionTxn.findMany({ where: { orderId } }),
    prisma.accessoryRequirement.findMany({ where: { orderId } }),
    prisma.materialEntry.findMany({ where: { requirement: { orderId } } }),
    prisma.accessoryEntry.findMany({ where: { requirement: { orderId } } }),
  ]);
  if (!allowed) return apiError(403, "You don't have access to this order.");

  return NextResponse.json({
    bundle: serializeForJson({
      sizes,
      lots,
      requirements,
      materialEntries,
      txns,
      accessoryRequirements,
      accessoryEntries,
    }),
  });
}
