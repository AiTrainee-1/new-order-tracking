/** Presentation helpers for TNA dates and durations (browser/local time). */

const dateTime = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const dateTimeYear = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" });
const dateOnlyYear = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** "10 Oct, 9:00 AM" */
export function fmtDateTime(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return (withYear ? dateTimeYear : dateTime).format(d).replace(/\bam\b/, "AM").replace(/\bpm\b/, "PM");
}

/** Like fmtDateTime, but the year only appears when it isn't this year - for tight spaces. */
export function fmtDateTimeSmart(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return fmtDateTime(iso, !Number.isNaN(d.getTime()) && d.getFullYear() !== new Date().getFullYear());
}

/** "10 Oct" */
export function fmtDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return (withYear ? dateOnlyYear : dateOnly).format(d);
}

/** Local midnight of the day containing `ms`. */
export const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** A signed "2d 4h earlier" / "1h later" phrase for a variance in minutes. */
export function describeVariance(minutes: number | null, earlier = "earlier", later = "later"): string {
  if (minutes === null) return "-";
  if (minutes === 0) return "exactly on plan";
  const abs = Math.abs(minutes);
  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  const m = abs % 60;
  const text = d > 0 ? (h > 0 ? `${d}d ${h}h` : `${d}d`) : h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return `${text} ${minutes < 0 ? earlier : later}`;
}
