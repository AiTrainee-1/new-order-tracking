import type { OrderStatus } from "./progress";

/**
 * One order's production position in a single glance - what the Orders, Output
 * and MD pages put on every order card.
 *
 * Every figure is derived by the same calculations the order's own pages use
 * (chain.ts for quantities, progress.ts for stages), just run for every order at
 * once on the server. Nothing here is stored.
 */
export interface OrderSummary {
  orderId: string;
  /** What the buyer ordered, summed over every PO. */
  buyerQty: number;
  /** What production actually runs against - buyer quantity plus the excess. */
  productionQty: number;
  /** productionQty - buyerQty, floored at 0. */
  excessQty: number;
  cutPcs: number;
  /** null when this order's plan has no Sewing stage. */
  sewnPcs: number | null;
  packedPcs: number;
  /** Pieces rejected at any garment stage - gone for good, never rework. */
  rejectedPcs: number;
  /** Pieces still sitting in rework across the garment stages. */
  reworkPendingPcs: number;
  completedStages: number;
  totalStages: number;
  /** Stages moved on without being finished - a balance still owed. */
  partialStages: number;
  currentStageLabel: string;
  status: OrderStatus;
  progressPct: number;
  /** The most recent day anything was recorded on this order. */
  lastEntryDate: string | null;
  /** Every quantity entry and stage action ever recorded on it. */
  entryCount: number;
}

export interface ProductionTotals {
  orders: number;
  buyerQty: number;
  productionQty: number;
  excessQty: number;
  cutPcs: number;
  sewnPcs: number;
  packedPcs: number;
  rejectedPcs: number;
  reworkPendingPcs: number;
  /** Still to deliver: production - packed - rejected, per order floored at 0. */
  balancePcs: number;
}

/** What is still to be delivered on an order once rejected pieces are written off. */
export function balanceOf(s: Pick<OrderSummary, "productionQty" | "packedPcs" | "rejectedPcs">): number {
  return Math.max(s.productionQty - s.packedPcs - s.rejectedPcs, 0);
}

export function sumSummaries(rows: OrderSummary[]): ProductionTotals {
  const t: ProductionTotals = { orders: rows.length, buyerQty: 0, productionQty: 0, excessQty: 0, cutPcs: 0, sewnPcs: 0, packedPcs: 0, rejectedPcs: 0, reworkPendingPcs: 0, balancePcs: 0 };
  for (const r of rows) {
    t.buyerQty += r.buyerQty;
    t.productionQty += r.productionQty;
    t.excessQty += r.excessQty;
    t.cutPcs += r.cutPcs;
    t.sewnPcs += r.sewnPcs ?? 0;
    t.packedPcs += r.packedPcs;
    t.rejectedPcs += r.rejectedPcs;
    t.reworkPendingPcs += r.reworkPendingPcs;
    t.balancePcs += balanceOf(r);
  }
  return t;
}
