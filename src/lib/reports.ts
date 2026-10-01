import type { DatePreset, TrackingOrder } from "./trackingHistory";

/**
 * Reports - a deliberately simpler cut of the same data Tracking History's
 * Final Order Report already computes (see GET /api/tracking-history and
 * useTrackingHistory): no new backend, no new notion of "an entry" - just a
 * flat Order/Buyer/Stage/Entries table over whichever orders were asked for,
 * limited to the 5 periods and 3 order-selection modes this page offers.
 */

export type ReportPreset = "today" | "yesterday" | "thisWeek" | "thisMonth" | "custom";

export const REPORT_PRESETS: { key: ReportPreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "custom", label: "Custom Date" },
];

/** A ReportPreset is always a subset of DatePreset - resolveRange handles it unchanged. */
export function toDatePreset(p: ReportPreset): DatePreset {
  return p;
}

export type OrderScope = "all" | "specific" | "buyer";

export const ORDER_SCOPES: { key: OrderScope; label: string; hint: string }[] = [
  { key: "all", label: "All Orders", hint: "Every order with activity in this period." },
  { key: "specific", label: "Specific Orders", hint: "Pick exactly which orders to include." },
  { key: "buyer", label: "Buyer-Wise", hint: "Every order for one buyer." },
];

export interface ReportRow {
  orderId: string;
  ioNo: string;
  style: string;
  buyerName: string | null;
  stageSeq: number;
  stageLabel: string;
  entries: number;
}

export interface ReportFilters {
  scope: OrderScope;
  orderIds: Set<string>;
  buyerId: string;
}

function ordersInScope(orders: TrackingOrder[], filters: ReportFilters): TrackingOrder[] {
  if (filters.scope === "specific") return orders.filter((o) => filters.orderIds.has(o.id));
  if (filters.scope === "buyer") return filters.buyerId ? orders.filter((o) => o.buyer?.id === filters.buyerId) : [];
  return orders;
}

/** One row per (order, stage) that actually has an entry in the period - a
 *  stage nobody touched simply doesn't appear, matching "no unnecessary
 *  information". Sorted by IO number, then the stage's real position in
 *  that order's own plan (not alphabetically), so it reads as a workflow. */
export function buildReportRows(orders: TrackingOrder[], filters: ReportFilters): ReportRow[] {
  return ordersInScope(orders, filters)
    .flatMap((o) =>
      o.stages
        .filter((s) => s.entries > 0)
        .map((s): ReportRow => ({ orderId: o.id, ioNo: o.ioNo, style: o.style, buyerName: o.buyer?.name ?? null, stageSeq: s.seq, stageLabel: s.label, entries: s.entries })),
    )
    .sort((a, b) => a.ioNo.localeCompare(b.ioNo, undefined, { numeric: true }) || a.stageSeq - b.stageSeq);
}

export function describeReportFilters(filters: ReportFilters, buyerName: string | null, orderCount: number): string {
  if (filters.scope === "all") return "Orders: All";
  if (filters.scope === "buyer") return `Orders: Buyer-wise — ${buyerName ?? "No buyer selected"}`;
  return `Orders: Specific — ${orderCount} order${orderCount === 1 ? "" : "s"} selected`;
}
