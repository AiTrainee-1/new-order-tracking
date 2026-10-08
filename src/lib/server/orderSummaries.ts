import "server-only";
import { prisma } from "./prisma";
import { serializeForJson } from "./serialize";
import { buildOutputSummary, buildProductionChain } from "../chain";
import { buildOrderProgress } from "../progress";
import { getCombinedCutQuantity } from "../orderQty";
import { effectiveSizes, sortSizes } from "../sizes";
import type { OrderSummary } from "../orderSummary";
import type { ChainSection, Order, PoSizeQuantity, ProductionTxn, PurchaseOrder, StageEntry } from "../types";

/**
 * Every order's production position, computed with the same chain and progress
 * calculations the order pages use - so the numbers on a card can never
 * disagree with the order's own page. Lots, requirements and material entries
 * are left out of the chain on purpose: nothing here reads them (the garment
 * quantities this summarises begin at Cutting, where the unit switches and
 * nothing is inherited from the fabric side).
 *
 * Everything is fetched in ONE wave of independent queries rather than as
 * `include`s - each include is its own round trip, run one after another, and
 * with the database a network hop away that was the whole cost of this page.
 */
export async function buildOrderSummaries(opts: { includeHidden: boolean }): Promise<OrderSummary[]> {
  const inScope = opts.includeHidden ? {} : { order: { isHidden: false } };
  const [orders, buyers, pos, sizeRows, plans, txns, entries] = await Promise.all([
    prisma.order.findMany({ where: opts.includeHidden ? {} : { isHidden: false } }),
    prisma.buyer.findMany({ select: { id: true, name: true } }),
    prisma.purchaseOrder.findMany({ where: inScope }),
    prisma.poSizeQuantity.findMany({ where: opts.includeHidden ? {} : { purchaseOrder: { order: { isHidden: false } } } }),
    prisma.orderStagePlan.findMany({ where: inScope, orderBy: { seq: "asc" } }),
    prisma.productionTxn.findMany({
      where: inScope,
      select: { id: true, orderId: true, poId: true, sectionId: true, lotId: true, sizeCode: true, txnType: true, unit: true, qtyIn: true, qtyOut: true, qtyRejected: true, qtyRework: true, qtyCount: true, entryDate: true, createdAt: true },
    }),
    prisma.stageEntry.findMany({ where: inScope }),
  ]);
  if (orders.length === 0) return [];

  const group = <T extends { orderId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const list = map.get(r.orderId) ?? [];
      list.push(r);
      map.set(r.orderId, list);
    }
    return map;
  };
  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const posByOrder = group(serializeForJson(pos) as unknown as PurchaseOrder[]);
  const sizesByPo = new Map<string, PoSizeQuantity[]>();
  for (const s of serializeForJson(sizeRows) as unknown as PoSizeQuantity[]) {
    const list = sizesByPo.get(s.poId) ?? [];
    list.push(s);
    sizesByPo.set(s.poId, list);
  }
  const plansByOrder = group(serializeForJson(plans) as unknown as (ChainSection & { orderId: string })[]);
  const txnsByOrder = group(serializeForJson(txns) as unknown as ProductionTxn[]);
  const entriesByOrder = group(serializeForJson(entries) as unknown as StageEntry[]);

  return orders.map((raw) => {
    const base = serializeForJson(raw) as unknown as Order;
    const order: Order = { ...base, buyer: raw.buyerId ? (buyerById.get(raw.buyerId) ?? null) : null } as Order;
    const orderPos = posByOrder.get(order.id) ?? [];
    const stagePlan = plansByOrder.get(order.id) ?? [];
    const orderTxns = txnsByOrder.get(order.id) ?? [];
    const orderEntries = entriesByOrder.get(order.id) ?? [];

    // The order's size breakdown across every PO, with each PO's own extra %
    // applied - exactly how useProductionChain builds it for the order page.
    const bySize = new Map<string, number>();
    const sizeOrder: string[] = [];
    for (const po of orderPos) {
      for (const s of effectiveSizes(po, sortSizes(sizesByPo.get(po.id) ?? []))) {
        if (!bySize.has(s.sizeCode)) sizeOrder.push(s.sizeCode);
        bySize.set(s.sizeCode, (bySize.get(s.sizeCode) ?? 0) + s.quantity);
      }
    }
    const sizes = sizeOrder.map((sizeCode) => ({ sizeCode, quantity: bySize.get(sizeCode) ?? 0 }));
    const productionQty = sizes.reduce((t, s) => t + s.quantity, 0);
    const buyerQty = orderPos.reduce((t, po) => t + po.quantity, 0);

    const chain = buildProductionChain({ sections: stagePlan, txns: orderTxns, lots: [], requirements: [], materialEntries: [], totalPcs: productionQty, sizes });
    const out = buildOutputSummary(chain);
    const progress = buildOrderProgress(order, stagePlan, orderEntries, { totalQty: order.totalQty, cutQuantity: getCombinedCutQuantity(order, orderPos) });

    const sewing = chain.byKey.get("sewing");
    const lastDates = [...orderTxns.map((t) => t.entryDate), ...orderEntries.map((e) => e.entryDate)];
    const lastEntryDate = lastDates.length ? lastDates.reduce((a, b) => (a > b ? a : b)) : null;

    return {
      orderId: order.id,
      buyerQty,
      productionQty,
      excessQty: Math.max(productionQty - buyerQty, 0),
      cutPcs: out.cutPcs,
      sewnPcs: sewing ? sewing.output : null,
      packedPcs: out.packedPcs,
      rejectedPcs: out.totalRejectedPcs,
      reworkPendingPcs: out.reworkPendingPcs,
      completedStages: progress.completedStagesCount,
      totalStages: progress.stages.length,
      partialStages: progress.partialStagesCount,
      currentStageLabel: progress.stages[progress.currentStageIndex]?.stage.label ?? "-",
      status: progress.status,
      progressPct: progress.overallProgressPct,
      lastEntryDate: lastEntryDate ? lastEntryDate.slice(0, 10) : null,
      entryCount: orderTxns.length + orderEntries.length,
    };
  });
}
