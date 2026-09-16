import type { AssignmentWithDetails, Order, PurchaseOrder } from "./types";
import { applyExtraPercent } from "./sizes";

/** Order-wide production quantity, extra% included - the sum of every PO's
 * buyer quantity plus its own configured extra%. Data entry is never split
 * by PO (one order -> one data-entry form per stage), so this is the number
 * every order-level assignment measures against. */
export function getOrderProductionQty(purchaseOrders: PurchaseOrder[]): number {
  return purchaseOrders.reduce((sum, po) => sum + applyExtraPercent(po.quantity, po.extraPercent), 0);
}

/** The fixed reference quantity every post-Cutting stage compares against.
 * Before Cutting completes there's no fixed PCS number yet, so this falls
 * back to the originally planned totalQty. */
export function getFixedOrderQty(order: Pick<Order, "cutQuantity" | "totalQty">): number {
  return order.cutQuantity ?? order.totalQty;
}

export function getAssignmentQty(order: Pick<Order, "totalQty">, assignment: AssignmentWithDetails): number {
  return assignment.po?.quantity ?? order.totalQty;
}

export function getAssignmentFixedQty(
  order: Pick<Order, "cutQuantity" | "totalQty">,
  assignment: AssignmentWithDetails,
): number {
  if (assignment.po) return assignment.po.cutQuantity ?? assignment.po.quantity;
  return getFixedOrderQty(order);
}

/** Whole-order fixed baseline for a combined ("all POs") view, now that
 * Cutting is normally completed per PO rather than order-wide. Sums each
 * PO's own fixed quantity so the combined view still shows a real post-cut
 * PCS number instead of silently falling back to the pre-cut planned total. */
export function getCombinedCutQuantity(
  order: Pick<Order, "cutQuantity">,
  purchaseOrders: PurchaseOrder[],
): number | null {
  if (purchaseOrders.length === 0) return order.cutQuantity;
  const allCut = purchaseOrders.every((po) => po.cutQuantity != null);
  if (!allCut) return order.cutQuantity;
  return purchaseOrders.reduce((sum, po) => sum + (po.cutQuantity ?? 0), 0);
}

export interface QtyComparison {
  fixedQty: number;
  completedQty: number;
  balance: number;
  status: "shortage" | "on_target" | "surplus";
}

export function compareToFixedQty(fixedQty: number, completedQty: number): QtyComparison {
  const balance = fixedQty - completedQty;
  return {
    fixedQty,
    completedQty,
    balance: Math.max(balance, 0),
    status: balance > 0 ? "shortage" : balance < 0 ? "surplus" : "on_target",
  };
}
