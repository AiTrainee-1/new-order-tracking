/**
 * Tracking History - shared types and small helpers for the admin-only page
 * that shows, per order and per stage, what was entered in a date range and
 * where each stage stands. Everything here is derived from the existing
 * data-input tables (see GET /api/tracking-history) - nothing is stored.
 */

export type TrackingStageStatus = "not_started" | "in_progress" | "completed";

export const TRACKING_STATUS_LABEL: Record<TrackingStageStatus, string> = {
  not_started: "Not Yet Started",
  in_progress: "In Progress",
  completed: "Completed",
};

export interface TrackingStage {
  sectionId: string;
  seq: number;
  key: string;
  label: string;
  unitType: "KG" | "PCS";
  status: TrackingStageStatus;
  /** Entries recorded inside the selected date range. */
  entries: number;
  /** Entries recorded on this stage, ever. */
  totalEntries: number;
  /** yyyy-MM-dd of the most recent entry, or null if none. */
  lastEntryDate: string | null;
}

export interface TrackingOrder {
  id: string;
  ioNo: string;
  style: string;
  color: string | null;
  deliveryDate: string | null;
  buyer: { id: string; name: string } | null;
  stages: TrackingStage[];
}

export interface TrackingHistoryResponse {
  from: string;
  to: string;
  orders: TrackingOrder[];
}

export type DatePreset = "today" | "yesterday" | "week" | "custom";

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "custom", label: "Custom Date" },
];

/** yyyy-MM-dd in the browser's LOCAL calendar - `toISOString` would give the
 *  UTC day, which is the wrong day for anyone east of Greenwich early in the
 *  morning, exactly when an admin checks "today". */
export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The inclusive [from, to] day range for a preset. "This Week" runs Monday
 *  through today. A custom range is normalised so from <= to. */
export function resolveRange(preset: DatePreset, customFrom: string, customTo: string, now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: toDateKey(today), to: toDateKey(today) };
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: toDateKey(y), to: toDateKey(y) };
  }
  if (preset === "week") {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return { from: toDateKey(monday), to: toDateKey(today) };
  }
  const a = customFrom || toDateKey(today);
  const b = customTo || a;
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "26 September 2026" for a single day, "21 September 2026 – 26 September 2026" for a range. */
export function rangeLabel(from: string, to: string): string {
  return from === to ? longDate(from) : `${longDate(from)} – ${longDate(to)}`;
}

export function shortDate(key: string | null): string {
  if (!key) return "-";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Orders that received at least one entry inside the range. */
export function entriesInRange(order: TrackingOrder): number {
  return order.stages.reduce((sum, s) => sum + s.entries, 0);
}

export function stagesUpdatedInRange(order: TrackingOrder): number {
  return order.stages.filter((s) => s.entries > 0).length;
}
