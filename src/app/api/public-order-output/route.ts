import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiError } from "@/lib/server/http";
import { serializeForJson } from "@/lib/server/serialize";
import { buildProductionChain } from "@/lib/chain";
import { effectiveSizes, sortSizes } from "@/lib/sizes";
import type { ChainSection, PoSizeQuantity, PurchaseOrder } from "@/lib/types";

/**
 * Public, unauthenticated read of one order's Production Output dashboard -
 * the data source behind the QR-code share card (ShareQrModal) and the
 * view-only page it opens (SharedOutputPage). No session check: this is
 * meant to be called by an anonymous browser that scanned a QR code, not a
 * signed-in Admin/MD session.
 *
 * The order id in the URL (a random UUID) IS the access control, the same
 * model "anyone with the link" sharing uses everywhere else - so this
 * deliberately whitelists exactly which order columns it returns (no
 * createdBy, no anything else not already shown on the real dashboard) and
 * never returns user names, entered-by attribution, or audit history - the
 * real Output & Reports page doesn't show any of that in the sections this
 * mirrors either.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sums each size code across every PO of an order, extra% applied - the
 * exact logic of the private mergeSizesAcrossPos in useProductionChain.ts,
 * duplicated here since that file is a client hook module. */
function mergeSizesAcrossPos(purchaseOrders: PurchaseOrder[], allSizes: PoSizeQuantity[]): { sizeCode: string; quantity: number }[] {
  const totals = new Map<string, number>();
  const order: string[] = [];
  for (const po of purchaseOrders) {
    const rows = effectiveSizes(po, sortSizes(allSizes.filter((s) => s.poId === po.id)));
    for (const r of rows) {
      if (!totals.has(r.sizeCode)) order.push(r.sizeCode);
      totals.set(r.sizeCode, (totals.get(r.sizeCode) ?? 0) + r.quantity);
    }
  }
  return order.map((code) => ({ sizeCode: code, quantity: totals.get(code) ?? 0 }));
}

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
  if (!UUID_PATTERN.test(orderId)) {
    return apiError(404, "Order not found.");
  }

  const orderRow = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, ioNo: true, style: true, description: true, color: true, fabric: true, imageId: true, totalQty: true, deliveryDate: true },
  });
  if (!orderRow) return apiError(404, "Order not found.");

  const purchaseOrders = await prisma.purchaseOrder.findMany({ where: { orderId } });
  const stagePlan = await prisma.orderStagePlan.findMany({ where: { orderId }, orderBy: { seq: "asc" } });
  const poIds = purchaseOrders.map((p) => p.id);

  const [txns, lots, requirements, poSizeQuantities] = await Promise.all([
    prisma.productionTxn.findMany({ where: { orderId } }),
    prisma.productionLot.findMany({ where: { orderId } }),
    prisma.materialRequirement.findMany({ where: { orderId } }),
    poIds.length ? prisma.poSizeQuantity.findMany({ where: { poId: { in: poIds } } }) : Promise.resolve([]),
  ]);

  const materialEntries = requirements.length ? await prisma.materialEntry.findMany({ where: { requirementId: { in: requirements.map((r) => r.id) } } }) : [];

  const plain = serializeForJson({ purchaseOrders, stagePlan, txns, lots, requirements, materialEntries, poSizeQuantities }) as unknown as {
    purchaseOrders: PurchaseOrder[];
    stagePlan: ChainSection[];
    txns: Parameters<typeof buildProductionChain>[0]["txns"];
    lots: Parameters<typeof buildProductionChain>[0]["lots"];
    requirements: Parameters<typeof buildProductionChain>[0]["requirements"];
    materialEntries: Parameters<typeof buildProductionChain>[0]["materialEntries"];
    poSizeQuantities: PoSizeQuantity[];
  };

  const sizes = mergeSizesAcrossPos(plain.purchaseOrders, plain.poSizeQuantities);
  const totalPcs = sizes.reduce((total, s) => total + s.quantity, 0);

  const chain = buildProductionChain({
    sections: plain.stagePlan,
    totalPcs,
    sizes,
    lots: plain.lots,
    requirements: plain.requirements,
    materialEntries: plain.materialEntries,
    txns: plain.txns,
  });
  // Map doesn't survive JSON - the client rebuilds byKey from chain.stages
  // with the same one-liner every other consumer of this shape already uses.
  const { byKey: _byKey, ...chainForClient } = chain;

  const response = NextResponse.json({
    order: { ...orderRow, imageUrl: orderRow.imageId ? `/api/images/${orderRow.imageId}` : null },
    chain: serializeForJson(chainForClient),
  });
  response.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return response;
}
