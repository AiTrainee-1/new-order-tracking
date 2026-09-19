import { ORDER_STATUS_LABEL, type OrderProgress, type OrderStatus } from "./progress";
import { buildCsv, datedCsvName, downloadCsv } from "./csv";
import { formatDisplayDate } from "./workflow";
import type { Order } from "./types";

/**
 * The fleet dashboard's list logic - filtering, sorting, "where are orders
 * right now" counts and the CSV export - kept out of the component so the
 * rules live in one place. Everything takes the structural minimum
 * (`{ order, progress }`) rather than the hooks' OrderBundle, so it stays
 * framework-agnostic like progress.ts and chain.ts.
 */
export interface DashboardOrder {
  order: Order;
  progress: OrderProgress;
}

/** "started" is every in-progress status together (on track, due soon and
 *  delayed); the rest are exactly the order statuses. */
export type OrderFilter = "all" | "started" | OrderStatus;

export type OrderSort = "priority" | "delivery" | "progress" | "style";

export const ORDER_SORTS: { key: OrderSort; label: string }[] = [
  { key: "priority", label: "Priority (in-progress first)" },
  { key: "delivery", label: "Delivery date (soonest)" },
  { key: "progress", label: "Progress (most complete)" },
  { key: "style", label: "Style (A-Z)" },
];

/** Work is under way and not finished - the three statuses that need a floor
 *  worker's attention, as opposed to not yet started or done. */
export function isInProgress(o: DashboardOrder): boolean {
  const { status } = o.progress;
  return status === "on_track" || status === "due_soon" || status === "delayed";
}

export function currentStageLabel(o: DashboardOrder): string {
  return o.progress.stages[o.progress.currentStageIndex]?.stage.label ?? "-";
}

export function matchesOrderFilter(o: DashboardOrder, filter: OrderFilter): boolean {
  if (filter === "all") return true;
  if (filter === "started") return isInProgress(o);
  return o.progress.status === filter;
}

/** Style, IO, colour, any of the order's PO numbers, or the stage it's at. */
export function matchesDashboardSearch(o: DashboardOrder & { purchaseOrders: { poNumber: string }[] }, query: string): boolean {
  const { order } = o;
  return [order.ioNo, order.style, order.color, currentStageLabel(o), ...o.purchaseOrders.map((po) => po.poNumber)].some((value) => value?.toLowerCase().includes(query));
}

const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
const daysOf = (o: DashboardOrder) => o.progress.daysRemaining ?? Number.POSITIVE_INFINITY;
const byDelivery = (a: DashboardOrder, b: DashboardOrder) => cmp(daysOf(a), daysOf(b));

/** In-flight work is what needs attention, finished orders drop to the bottom. */
const priorityRank = (o: DashboardOrder) => (o.progress.status === "completed" ? 2 : o.progress.status === "not_started" ? 1 : 0);

export function sortOrders<T extends DashboardOrder>(orders: T[], sort: OrderSort): T[] {
  const list = [...orders];
  switch (sort) {
    case "delivery":
      return list.sort(byDelivery);
    case "progress":
      return list.sort((a, b) => cmp(b.progress.overallProgressPct, a.progress.overallProgressPct) || byDelivery(a, b));
    case "style":
      return list.sort((a, b) => a.order.style.localeCompare(b.order.style) || a.order.ioNo.localeCompare(b.order.ioNo));
    default:
      return list.sort((a, b) => cmp(priorityRank(a), priorityRank(b)) || byDelivery(a, b));
  }
}

export interface StageCount {
  label: string;
  count: number;
  /** How many of those are delayed - a stage with late orders stuck at it is
   *  the bottleneck worth looking at first. */
  delayed: number;
}

/** In-progress orders grouped by the stage they're currently at, biggest
 *  pile-up first. Not-started orders (all sitting at the first stage) and
 *  finished ones (at the last) would only drown out the real picture. */
export function buildStageCounts(orders: DashboardOrder[]): StageCount[] {
  const byStage = new Map<string, StageCount>();
  for (const o of orders) {
    if (!isInProgress(o)) continue;
    const label = currentStageLabel(o);
    const entry = byStage.get(label) ?? { label, count: 0, delayed: 0 };
    entry.count++;
    if (o.progress.status === "delayed") entry.delayed++;
    byStage.set(label, entry);
  }
  return [...byStage.values()].sort((a, b) => b.count - a.count || b.delayed - a.delayed || a.label.localeCompare(b.label));
}

export function buildOrdersCsv(orders: DashboardOrder[]): string {
  const head = ["IO No", "Style", "Colour", "Status", "Progress %", "Stages done", "Total stages", "Current stage", "Delivery date", "Days left (negative = overdue)"];
  const rows = orders.map((o) => [
    o.order.ioNo,
    o.order.style,
    o.order.color ?? "",
    ORDER_STATUS_LABEL[o.progress.status],
    o.progress.overallProgressPct,
    o.progress.completedStagesCount,
    o.progress.stages.length,
    currentStageLabel(o),
    formatDisplayDate(o.order.deliveryDate),
    o.progress.daysRemaining ?? "",
  ]);
  return buildCsv(head, rows);
}

/** Downloads the given orders as a CSV - what's on screen, so filter and
 *  search first to export just a slice. */
export function exportOrdersCsv(orders: DashboardOrder[]): void {
  downloadCsv(datedCsvName("orders"), buildOrdersCsv(orders));
}
