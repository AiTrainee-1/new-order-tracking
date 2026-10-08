"use client";

import { useGroupTotals } from "@/hooks/useOrderGroups";
import { memberLabel } from "@/lib/orderGroups";
import type { GroupTotalsMetric, GroupTotalsStage } from "@/lib/groupTotals";
import { LinkGlyph } from "./GroupIndicator";

/**
 * The group-level view of a group's stages: each order's own figure next to the
 * others, so a grouped stage can be read across every order at once. (The API
 * still returns the summed totals; this view deliberately doesn't show a total
 * row.)
 *
 * It is worked out from the orders' own records each time it is shown, so it
 * includes everything entered on those orders before the group existed, and it
 * disappears with the group - nothing here is stored, merged or overwritten.
 */

const TONE: Record<NonNullable<GroupTotalsMetric["tone"]>, string> = {
  good: "text-status-good",
  bad: "text-status-bad",
  warn: "text-amber-600",
  info: "text-sky-700",
};

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function GroupTotalsCard({
  groupId,
  stageKey,
  currentOrderId,
  enabled = true,
  title = "Group total",
}: {
  groupId: string;
  /** Show only this stage; omit for every stage the group covers. */
  stageKey?: string;
  /** Highlights this order's own row. */
  currentOrderId?: string;
  enabled?: boolean;
  title?: string;
}) {
  const { data, isLoading, isError } = useGroupTotals(groupId, enabled);
  if (!enabled) return null;
  if (isLoading) return <p className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-3 text-xs text-violet-800">Adding up the group…</p>;
  if (isError || !data) return <p className="rounded-xl border border-dashed border-ink-200 px-3 py-3 text-xs text-ink-500">Couldn&apos;t work out the group total just now.</p>;

  const stages = stageKey ? data.stages.filter((s) => s.stageKey === stageKey) : data.stages;
  if (stages.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-violet-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white">
            <LinkGlyph size={12} />
          </span>
          {title} - &ldquo;{data.groupName}&rdquo;
        </p>
        <span className="text-[11px] text-violet-700">Live from each order&apos;s own records</span>
      </div>

      {stages.map((st) => (
        <StageTable key={st.stageKey} stage={st} currentOrderId={currentOrderId} showLabel={!stageKey} />
      ))}

      <p className="text-[11px] leading-relaxed text-violet-800/80">
        Each row is that order&apos;s own figure, so everything already recorded on it is included. Nothing is merged: remove the group and each order simply goes back to its own figure.
      </p>
    </div>
  );
}

function StageTable({ stage, currentOrderId, showLabel }: { stage: GroupTotalsStage; currentOrderId?: string; showLabel: boolean }) {
  return (
    <div>
      {showLabel && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-violet-900">{stage.stageLabel}</p>}
      <div className="overflow-x-auto rounded-xl border border-violet-200 bg-white">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="bg-violet-100/70 text-[11px] uppercase tracking-wide text-violet-900">
              <th className="px-3 py-2 text-left font-semibold">Order</th>
              {stage.metrics.map((m) => (
                <th key={m.key} className="px-3 py-2 text-right font-semibold">
                  {m.label}
                  {m.unit && <span className="ml-1 text-[9px] font-medium normal-case text-violet-700/70">{m.unit}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {stage.members.map((m) => (
              <tr key={m.orderId} className={m.orderId === currentOrderId ? "bg-violet-50" : undefined}>
                <td className="px-3 py-1.5 text-ink-800">
                  <span className="font-medium">{memberLabel(m)}</span>
                  {m.orderId === currentOrderId && <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">this order</span>}
                </td>
                {stage.metrics.map((metric) => (
                  <td key={metric.key} className={`px-3 py-1.5 text-right tabular-nums ${metric.tone ? TONE[metric.tone] : "text-ink-900"}`}>
                    {fmt(m.values[metric.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
