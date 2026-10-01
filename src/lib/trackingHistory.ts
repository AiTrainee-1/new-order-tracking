/**
 * Tracking History - shared types and small pure helpers for the admin-only
 * reporting suite (Final Order Report, User-Wise Report, Today vs Yesterday,
 * Stage/Order-Wise, Detailed Activity). See src/lib/server/trackingActivity.ts
 * for what "an entry" means and where the numbers come from; everything here
 * is plain and framework-agnostic so it can run on the client or the server.
 */

export type ActivitySource = "production" | "material" | "accessory" | "stage";

/** One real data-entry action. `at` is always createdAt - see the server
 *  module's module comment for why that, not an editable business date, is
 *  what every report range-filters and sorts by. */
export interface ActivityRecord {
  id: string;
  source: ActivitySource;
  at: string;
  userId: string;
  userName: string;
  orderId: string;
  ioNo: string;
  style: string;
  buyerId: string | null;
  buyerName: string | null;
  stageKey: string;
  stageLabel: string;
  qty: number | null;
  unit: string | null;
  action: string;
  completed: boolean;
}

export interface ActivityResponse {
  from: string;
  to: string;
  records: ActivityRecord[];
}

// ---------------------------------------------------------------------------
// Final Order Report - per order, per stage: lifetime status + period count
// ---------------------------------------------------------------------------

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
  /** ISO timestamp of the most recent entry, or null if none. */
  lastEntryAt: string | null;
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

/** Orders that received at least one entry inside the range. */
export function entriesInRange(order: TrackingOrder): number {
  return order.stages.reduce((sum, s) => sum + s.entries, 0);
}

export function stagesUpdatedInRange(order: TrackingOrder): number {
  return order.stages.filter((s) => s.entries > 0).length;
}

/** The always-on Report Dashboard numbers - see GET /api/tracking-history/overview. */
export interface TrackingOverview {
  totalOrders: number;
  completedStages: number;
  pendingStages: number;
  totalStages: number;
  todayEntries: number;
  yesterdayEntries: number;
  activeUsersToday: number;
}

// ---------------------------------------------------------------------------
// Date & time range model
// ---------------------------------------------------------------------------

export type DatePreset = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom" | "customDateTime";

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "custom", label: "Custom Date Range" },
  { key: "customDateTime", label: "Custom Date + Time" },
];

export interface DateRange {
  /** ISO instants - what every API call filters createdAt against. */
  fromISO: string;
  toISO: string;
  /** "day" shows dates only in labels/exports; "minute" also shows times -
   *  only customDateTime uses exact, possibly-mid-day boundaries. */
  precision: "day" | "minute";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}
/** Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  return addDays(startOfDay(d), day === 0 ? -6 : 1 - day);
}

/** yyyy-MM-dd in the LOCAL calendar - used for date-only `<input>` values. */
export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** yyyy-MM-ddTHH:mm in the LOCAL calendar - for `<input type="datetime-local">`. */
export function toDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Every preset resolves entirely in the BROWSER's own local time, straight
 * to absolute ISO instants - the server never has to guess a timezone, it
 * just filters createdAt between the two instants it's given.
 */
export function resolveRange(
  preset: DatePreset,
  custom: { from: string; to: string; fromTime?: string; toTime?: string },
  now: Date = new Date(),
): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { fromISO: today.toISOString(), toISO: endOfDay(now).toISOString(), precision: "day" };
    case "yesterday": {
      const y = addDays(today, -1);
      return { fromISO: y.toISOString(), toISO: endOfDay(y).toISOString(), precision: "day" };
    }
    case "thisWeek":
      return { fromISO: mondayOf(now).toISOString(), toISO: endOfDay(now).toISOString(), precision: "day" };
    case "lastWeek": {
      const thisMonday = mondayOf(now);
      const lastMonday = addDays(thisMonday, -7);
      return { fromISO: lastMonday.toISOString(), toISO: endOfDay(addDays(thisMonday, -1)).toISOString(), precision: "day" };
    }
    case "thisMonth": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { fromISO: first.toISOString(), toISO: endOfDay(now).toISOString(), precision: "day" };
    }
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { fromISO: first.toISOString(), toISO: endOfDay(last).toISOString(), precision: "day" };
    }
    case "customDateTime": {
      const from = custom.from ? new Date(`${custom.from}T${custom.fromTime || "00:00"}`) : today;
      const to = custom.to ? new Date(`${custom.to}T${custom.toTime || "23:59"}`) : endOfDay(now);
      return normalizeOrder(from, to, "minute");
    }
    case "custom":
    default: {
      const from = custom.from ? startOfDay(new Date(`${custom.from}T00:00`)) : today;
      const to = custom.to ? endOfDay(new Date(`${custom.to}T00:00`)) : endOfDay(now);
      return normalizeOrder(from, to, "day");
    }
  }
}

function normalizeOrder(from: Date, to: Date, precision: "day" | "minute"): DateRange {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { fromISO: a.toISOString(), toISO: b.toISOString(), precision };
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function timeOf(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "26 September 2026" for a single day, a full "… – …" span otherwise, with
 *  times included once the range carries minute precision. */
export function rangeLabel(range: DateRange): string {
  const from = new Date(range.fromISO);
  const to = new Date(range.toISO);
  if (range.precision === "day") {
    return toDateKey(from) === toDateKey(to) ? longDate(from) : `${longDate(from)} – ${longDate(to)}`;
  }
  return `${longDate(from)} ${timeOf(from)} – ${longDate(to)} ${timeOf(to)}`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function shortDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}, ${timeOf(d)}`;
}

export function timeOnly(iso: string): string {
  return timeOf(new Date(iso));
}
