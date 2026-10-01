import type { ActivityRecord } from "./trackingHistory";

/**
 * Pure aggregation over an ActivityRecord[] - the User-Wise Report, the
 * Stage/Order-Wise Reports, the Detailed Activity Report, and Today vs
 * Yesterday are all just a different grouping of the SAME list (see
 * src/lib/server/trackingActivity.ts for how that list is built), so their
 * numbers can never disagree with each other. Everything here is plain
 * client-safe TypeScript - no fetching, no React.
 */

export interface ActivityFilters {
  userId?: string;
  orderId?: string;
  stageKey?: string;
}

export function applyActivityFilters(records: ActivityRecord[], filters: ActivityFilters): ActivityRecord[] {
  return records.filter(
    (r) => (!filters.userId || r.userId === filters.userId) && (!filters.orderId || r.orderId === filters.orderId) && (!filters.stageKey || r.stageKey === filters.stageKey),
  );
}

/** Adds each record's 1-based position within its OWN user's timeline (the
 *  "entry sequence" a per-user drill-down shows) without mutating the input. */
export interface SequencedRecord extends ActivityRecord {
  sequence: number;
}

export function withUserSequence(records: ActivityRecord[]): SequencedRecord[] {
  const sorted = [...records].sort((a, b) => a.at.localeCompare(b.at));
  const counters = new Map<string, number>();
  return sorted.map((r) => {
    const next = (counters.get(r.userId) ?? 0) + 1;
    counters.set(r.userId, next);
    return { ...r, sequence: next };
  });
}

// ---------------------------------------------------------------------------
// User-Wise Report
// ---------------------------------------------------------------------------

export interface UserActivitySummary {
  userId: string;
  userName: string;
  totalEntries: number;
  orderCount: number;
  stageCount: number;
  firstEntryAt: string | null;
  lastEntryAt: string | null;
  /** Date (yyyy-MM-dd, local) -> entry count, for a per-day sparkline/table. */
  byDate: { date: string; count: number }[];
  byStage: { stageKey: string; stageLabel: string; count: number }[];
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildUserSummaries(records: ActivityRecord[]): UserActivitySummary[] {
  const byUser = new Map<string, ActivityRecord[]>();
  for (const r of records) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  return Array.from(byUser.entries())
    .map(([userId, rows]) => {
      const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at));
      const byDateMap = new Map<string, number>();
      const byStageMap = new Map<string, { stageLabel: string; count: number }>();
      for (const r of rows) {
        const dk = localDateKey(r.at);
        byDateMap.set(dk, (byDateMap.get(dk) ?? 0) + 1);
        const s = byStageMap.get(r.stageKey) ?? { stageLabel: r.stageLabel, count: 0 };
        s.count += 1;
        byStageMap.set(r.stageKey, s);
      }
      return {
        userId,
        userName: rows[0].userName,
        totalEntries: rows.length,
        orderCount: new Set(rows.map((r) => r.orderId)).size,
        stageCount: new Set(rows.map((r) => r.stageKey)).size,
        firstEntryAt: sorted[0]?.at ?? null,
        lastEntryAt: sorted[sorted.length - 1]?.at ?? null,
        byDate: Array.from(byDateMap.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        byStage: Array.from(byStageMap.entries())
          .map(([stageKey, v]) => ({ stageKey, stageLabel: v.stageLabel, count: v.count }))
          .sort((a, b) => b.count - a.count),
      };
    })
    .sort((a, b) => b.totalEntries - a.totalEntries);
}

// ---------------------------------------------------------------------------
// Stage-Wise / Order-Wise Reports
// ---------------------------------------------------------------------------

export interface StageActivitySummary {
  stageKey: string;
  stageLabel: string;
  totalEntries: number;
  orderCount: number;
  userCount: number;
  lastEntryAt: string | null;
}

export function buildStageSummaries(records: ActivityRecord[]): StageActivitySummary[] {
  const byStage = new Map<string, ActivityRecord[]>();
  for (const r of records) byStage.set(r.stageKey, [...(byStage.get(r.stageKey) ?? []), r]);
  return Array.from(byStage.entries())
    .map(([stageKey, rows]) => ({
      stageKey,
      stageLabel: rows[0].stageLabel,
      totalEntries: rows.length,
      orderCount: new Set(rows.map((r) => r.orderId)).size,
      userCount: new Set(rows.map((r) => r.userId)).size,
      lastEntryAt: rows.reduce<string | null>((max, r) => (!max || r.at > max ? r.at : max), null),
    }))
    .sort((a, b) => b.totalEntries - a.totalEntries);
}

export interface OrderActivitySummary {
  orderId: string;
  ioNo: string;
  style: string;
  buyerName: string | null;
  totalEntries: number;
  stageCount: number;
  userCount: number;
  lastEntryAt: string | null;
}

export function buildOrderSummaries(records: ActivityRecord[]): OrderActivitySummary[] {
  const byOrder = new Map<string, ActivityRecord[]>();
  for (const r of records) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]);
  return Array.from(byOrder.entries())
    .map(([orderId, rows]) => ({
      orderId,
      ioNo: rows[0].ioNo,
      style: rows[0].style,
      buyerName: rows[0].buyerName,
      totalEntries: rows.length,
      stageCount: new Set(rows.map((r) => r.stageKey)).size,
      userCount: new Set(rows.map((r) => r.userId)).size,
      lastEntryAt: rows.reduce<string | null>((max, r) => (!max || r.at > max ? r.at : max), null),
    }))
    .sort((a, b) => b.totalEntries - a.totalEntries);
}

// ---------------------------------------------------------------------------
// Today vs Yesterday Comparison
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  key: string;
  label: string;
  today: number;
  yesterday: number;
  diff: number;
}

/** Merges two "group by X -> count" passes into one Today/Yesterday/Diff
 *  table, keeping every key that appeared on EITHER day (a key that
 *  stopped - or only just started - matters just as much as one that grew). */
function mergeComparison(today: Map<string, { label: string; count: number }>, yesterday: Map<string, { label: string; count: number }>): ComparisonRow[] {
  const keys = new Set([...today.keys(), ...yesterday.keys()]);
  return Array.from(keys, (key) => {
    const t = today.get(key)?.count ?? 0;
    const y = yesterday.get(key)?.count ?? 0;
    return { key, label: today.get(key)?.label ?? yesterday.get(key)?.label ?? key, today: t, yesterday: y, diff: t - y };
  }).sort((a, b) => b.today - a.today || b.yesterday - a.yesterday);
}

function countBy(records: ActivityRecord[], keyOf: (r: ActivityRecord) => string, labelOf: (r: ActivityRecord) => string): Map<string, { label: string; count: number }> {
  const map = new Map<string, { label: string; count: number }>();
  for (const r of records) {
    const k = keyOf(r);
    const row = map.get(k) ?? { label: labelOf(r), count: 0 };
    row.count += 1;
    map.set(k, row);
  }
  return map;
}

export interface TodayVsYesterday {
  totals: { today: number; yesterday: number; diff: number };
  orders: { today: number; yesterday: number; diff: number };
  byUser: ComparisonRow[];
  byStage: ComparisonRow[];
  byOrder: ComparisonRow[];
}

export function buildComparison(today: ActivityRecord[], yesterday: ActivityRecord[]): TodayVsYesterday {
  const orderCount = (records: ActivityRecord[]) => new Set(records.map((r) => r.orderId)).size;
  return {
    totals: { today: today.length, yesterday: yesterday.length, diff: today.length - yesterday.length },
    orders: { today: orderCount(today), yesterday: orderCount(yesterday), diff: orderCount(today) - orderCount(yesterday) },
    byUser: mergeComparison(
      countBy(today, (r) => r.userId, (r) => r.userName),
      countBy(yesterday, (r) => r.userId, (r) => r.userName),
    ),
    byStage: mergeComparison(
      countBy(today, (r) => r.stageKey, (r) => r.stageLabel),
      countBy(yesterday, (r) => r.stageKey, (r) => r.stageLabel),
    ),
    byOrder: mergeComparison(
      countBy(today, (r) => r.orderId, (r) => `${r.ioNo} · ${r.style}`),
      countBy(yesterday, (r) => r.orderId, (r) => `${r.ioNo} · ${r.style}`),
    ),
  };
}
