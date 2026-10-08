import type { CSSProperties } from "react";
import { TNA_STATUS_META, computeTna, type TnaRecord, type TnaResult } from "./tna";
import { startOfDay } from "./tnaFormat";

/**
 * The layout maths behind the TNA timelines (the Admin page's scrolling one and
 * the MD page's pan-and-zoom canvas): which orders and stages go where, the
 * window of time they span, and the month bands and day ticks along the top.
 * Pure functions, so both views draw exactly the same picture.
 */

export const DAY = 86_400_000;

export interface TnaRow {
  record: TnaRecord;
  result: TnaResult;
}

export interface TnaGroup {
  orderId: string;
  order: NonNullable<TnaRecord["order"]>;
  rows: TnaRow[];
}

const worstRank = (rows: TnaRow[]) => Math.min(...rows.map((r) => TNA_STATUS_META[r.result.status].rank));

/** Records grouped by order: the most urgent orders first, stages in their workflow order. */
export function buildGroups(records: TnaRecord[], now: number): TnaGroup[] {
  const by = new Map<string, TnaGroup>();
  for (const r of records) {
    if (!r.order) continue;
    const g = by.get(r.orderId) ?? { orderId: r.orderId, order: r.order, rows: [] };
    g.rows.push({ record: r, result: computeTna(r, now) });
    by.set(r.orderId, g);
  }
  const list = [...by.values()];
  for (const g of list) g.rows.sort((a, b) => a.record.stageSeq - b.record.stageSeq);
  return list.sort((a, b) => worstRank(a.rows) - worstRank(b.rows) || new Date(a.rows[0].record.plannedStart).getTime() - new Date(b.rows[0].record.plannedStart).getTime());
}

/** The window of time to draw: everything planned or recorded, padded, and including "now" while anything is open. */
export function computeRange(records: TnaRecord[], now: number): { lo: number; hi: number } {
  if (records.length === 0) return { lo: startOfDay(now) - 3 * DAY, hi: startOfDay(now) + 18 * DAY };
  let min = Infinity;
  let max = -Infinity;
  let anyOpen = false;
  for (const r of records) {
    const grace = r.graceMinutes * 60_000;
    min = Math.min(min, new Date(r.plannedStart).getTime(), r.actualStartAt ? new Date(r.actualStartAt).getTime() : Infinity);
    max = Math.max(max, new Date(r.plannedEnd).getTime() + grace, r.completedAt ? new Date(r.completedAt).getTime() : -Infinity);
    if (!r.completedAt) anyOpen = true;
  }
  if (anyOpen) {
    min = Math.min(min, now);
    max = Math.max(max, now);
  }
  const lo = startOfDay(min) - 2 * DAY;
  const hi = Math.max(startOfDay(max) + 3 * DAY, lo + 14 * DAY);
  return { lo, hi };
}

export interface MonthBand {
  start: number;
  end: number;
  label: string;
}

export function monthBands(lo: number, hi: number): MonthBand[] {
  const out: MonthBand[] = [];
  let cur = new Date(lo);
  cur.setDate(1);
  cur.setHours(0, 0, 0, 0);
  let i = 0;
  while (cur.getTime() < hi && i < 120) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1).getTime();
    out.push({ start: Math.max(cur.getTime(), lo), end: Math.min(next, hi), label: cur.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) });
    cur = new Date(next);
    i++;
  }
  return out;
}

export interface Tick {
  at: number;
  label: string;
  /** Width this tick's label has before the next one, in days. */
  spanDays: number;
  weekend: boolean;
  major: boolean;
}

/**
 * Day marks along the top, thinned to suit the zoom: every day when there is
 * room for them, then every 2 days, weekly (Mondays), fortnightly, and finally
 * none at all - the month bands carry it. Labels never get closer than ~34px.
 * `everyDay` turns the thinning off: every date is marked at any zoom (the caller keeps the zoom
 * high enough for the numbers to fit, and the chart scrolls instead).
 */
export function ticksFor(lo: number, hi: number, ppd: number, everyDay = false): Tick[] {
  const steps = [1, 2, 7, 14];
  const step = everyDay ? 1 : steps.find((s) => ppd * s >= 34);
  if (!step) return [];
  const out: Tick[] = [];
  for (let t = lo; t < hi; t += DAY) {
    const d = new Date(t);
    const dow = d.getDay();
    const dayIndex = Math.round((t - lo) / DAY);
    let show = false;
    if (step === 1) show = true;
    else if (step === 2) show = dayIndex % 2 === 0;
    else if (step === 7) show = dow === 1;
    else show = dow === 1 && Math.floor(dayIndex / 7) % 2 === 0;
    if (show) out.push({ at: t, label: String(d.getDate()), spanDays: step, weekend: step === 1 && (dow === 0 || dow === 6), major: d.getDate() === 1 });
  }
  return out;
}

/** Weekend day starts, for shading - only worth drawing when a day is wide enough to see. */
export function weekendStarts(lo: number, hi: number, ppd: number): number[] {
  if (ppd < 22) return [];
  const out: number[] = [];
  for (let t = lo; t < hi; t += DAY) {
    const dow = new Date(t).getDay();
    if (dow === 0 || dow === 6) out.push(t);
  }
  return out;
}

/** The vertical hairlines behind the bars: a line per day when zoomed in, per week otherwise, none when tiny. */
export function gridBackground(ppd: number): CSSProperties {
  if (ppd >= 30) return { backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.22) 0 1px, transparent 1px ${ppd}px)` };
  if (ppd >= 9) return { backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.2) 0 1px, transparent 1px ${ppd * 7}px)` };
  return {};
}

/** Month-band colours, cycling - the reference timelines colour each period. */
export const MONTH_BAND_COLORS = ["#F97316", "#EC4899", "#8B5CF6", "#2563EB", "#0891B2", "#10B981"];
