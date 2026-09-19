import { deliveryUrgency } from "./workflow";
import type { Order, PurchaseOrder } from "./types";

/**
 * How the Orders page groups orders: by where their delivery date stands
 * (the list has no production-progress data - that's the dashboard's job),
 * with hidden orders set apart. Every order lands in exactly one bucket, so
 * the overview's counts, the filter tabs' counts and the cards' pills always
 * agree with each other.
 */
export type OrderBucket = "on_track" | "due_soon" | "overdue" | "no_date" | "hidden";

/** Healthiest to least healthy, hidden last - the order the overview bar and
 *  the filter tabs both read in. Colours follow the dashboard overview's. */
export const ORDER_BUCKETS: { key: OrderBucket; label: string; color: string }[] = [
  { key: "on_track", label: "On track", color: "#155EEF" },
  { key: "due_soon", label: "Due soon", color: "#F59E0B" },
  { key: "overdue", label: "Overdue", color: "#E11D48" },
  { key: "no_date", label: "No date", color: "#94A3B8" },
  { key: "hidden", label: "Hidden", color: "#64748B" },
];

export function bucketOfOrder(order: Pick<Order, "isHidden" | "deliveryDate">): OrderBucket {
  if (order.isHidden) return "hidden";
  const urgency = deliveryUrgency(order.deliveryDate);
  if (urgency === "overdue") return "overdue";
  if (urgency === "urgent" || urgency === "soon") return "due_soon";
  if (urgency === "none") return "no_date";
  return "on_track";
}

/** Style, IO, colour, or any of the order's PO numbers. */
export function orderMatchesSearch(order: Pick<Order, "ioNo" | "style" | "color"> & { purchaseOrders: Pick<PurchaseOrder, "poNumber">[] }, query: string): boolean {
  return [order.ioNo, order.style, order.color, ...order.purchaseOrders.map((po) => po.poNumber)].some((value) => value?.toLowerCase().includes(query));
}
