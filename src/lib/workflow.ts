const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a value from the database into a Date anchored to the LOCAL day.
 *
 * `deliveryDate` / `entryDate` are Postgres `date` columns, so they arrive as
 * plain "YYYY-MM-DD". Passing those straight to `new Date()` parses them as
 * UTC midnight per the ES spec - which, read back with local getters, lands on
 * the PREVIOUS day for anyone west of UTC and shifts every countdown by one.
 * Splitting the parts and building a local date keeps the calendar day intact.
 * Full timestamps (createdAt/updatedAt) already carry a zone, so they're left
 * to the normal parser.
 */
export function parseDbDate(value: string): Date {
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function diffInDays(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / msPerDay);
}

/** Whole days from today until the delivery date. Negative = overdue, 0 = due today. */
export function daysRemaining(deliveryDate: string | null): number | null {
  if (!deliveryDate) return null;
  return diffInDays(new Date(), parseDbDate(deliveryDate));
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDbDate(dateStr);
  d.setDate(d.getDate() + days);
  // Build the string from local parts - toISOString() would re-shift the day.
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return parseDbDate(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export type DeliveryUrgency = "overdue" | "urgent" | "soon" | "safe" | "none";

export function deliveryUrgency(deliveryDate: string | null): DeliveryUrgency {
  const remaining = daysRemaining(deliveryDate);
  if (remaining === null) return "none";
  if (remaining < 0) return "overdue";
  if (remaining <= 3) return "urgent";
  if (remaining <= 10) return "soon";
  return "safe";
}

export const urgencyColorClasses: Record<DeliveryUrgency, string> = {
  overdue: "bg-red-50 text-status-bad border-red-200",
  urgent: "bg-amber-50 text-status-warn border-amber-200",
  soon: "bg-amber-50/60 text-amber-700 border-amber-100",
  safe: "bg-green-50 text-status-good border-green-200",
  none: "bg-ink-50 text-ink-500 border-ink-200",
};

export const urgencyTextClasses: Record<DeliveryUrgency, string> = {
  overdue: "text-status-bad",
  urgent: "text-status-warn",
  soon: "text-amber-700",
  safe: "text-status-good",
  none: "text-ink-900",
};
