"use client";

import type { TrackingOverview } from "@/lib/trackingHistory";

/**
 * The always-on KPI strip: Today's/Yesterday's/the difference between them
 * are always literal, regardless of whatever date range the report tabs
 * below are filtered to (see useTrackingOverview). "This range" is the one
 * tile that DOES follow the current filter, so it reads naturally next to
 * the fixed Today/Yesterday pair rather than duplicating it.
 */
export function ReportDashboard({ overview, rangeEntries, rangeLabel }: { overview: TrackingOverview | undefined; rangeEntries: number; rangeLabel: string }) {
  if (!overview) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <SkeletonTile key={i} />)}</div>;
  }
  const diff = overview.todayEntries - overview.yesterdayEntries;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
      <Tile label={`Entries (${rangeLabel})`} value={rangeEntries} />
      <Tile label="Orders Tracked" value={overview.totalOrders} />
      <Tile label="Active Users Today" value={overview.activeUsersToday} tone="good" />
      <Tile label="Completed Stages" value={overview.completedStages} tone="good" sub={`of ${overview.totalStages}`} />
      <Tile label="Pending Stages" value={overview.pendingStages} tone={overview.pendingStages > 0 ? "warn" : undefined} sub={`of ${overview.totalStages}`} />
      <Tile label="Today's Entries" value={overview.todayEntries} />
      <Tile label="Yesterday's Entries" value={overview.yesterdayEntries} />
      <Tile
        label="Today vs Yesterday"
        value={`${diff > 0 ? "+" : ""}${diff}`}
        tone={diff > 0 ? "good" : diff < 0 ? "bad" : undefined}
      />
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const rail = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : tone === "bad" ? "bg-rose-500" : "bg-brand";
  const valueColor = tone === "bad" ? "text-rose-600" : "text-ink-900";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/80 p-3.5 shadow-[0_8px_24px_-16px_rgba(30,41,90,0.4)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${rail}`} />
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueColor}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-[10.5px] text-ink-400">{sub}</p>}
    </div>
  );
}

function SkeletonTile() {
  return <div className="h-[78px] animate-pulse rounded-2xl border border-white/80 bg-white/60" />;
}
