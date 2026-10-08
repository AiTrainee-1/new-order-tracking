"use client";

import { balanceOf, type OrderSummary, type ProductionTotals } from "@/lib/orderSummary";
import { formatDisplayDate } from "@/lib/workflow";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * An order's production position, compact enough to sit inside any order card:
 * stage progress, then Ordered -> Cut -> Sewn -> Packed as bars against the
 * production quantity, then what was rejected (gone for good), what is back in
 * rework (still owed) and what is left to deliver, and when anything last
 * happened on it.
 *
 * It only renders figures the order's own pages already show - the summary is
 * computed by the same calculations - so a card can't say something its order
 * page doesn't.
 */
export function OrderProductionStrip({ summary, showStages = false }: { summary: OrderSummary | undefined; showStages?: boolean }) {
  if (!summary) {
    return (
      <div className="space-y-2" aria-hidden>
        <div className="h-3 animate-pulse rounded-full bg-black/5" />
        <div className="h-16 animate-pulse rounded-xl bg-black/5" />
      </div>
    );
  }

  const base = Math.max(summary.productionQty, 1);
  const bars: { label: string; value: number | null; color: string }[] = [
    { label: "Cut", value: summary.cutPcs, color: "bg-violet-500" },
    ...(summary.sewnPcs !== null ? [{ label: "Sewn", value: summary.sewnPcs, color: "bg-amber-500" }] : []),
    { label: "Packed", value: summary.packedPcs, color: "bg-emerald-500" },
  ];
  const balance = balanceOf(summary);

  return (
    <div className="space-y-2.5 rounded-xl border border-white/80 bg-white/70 p-3">
      {showStages && (
        <div className="space-y-1.5 border-b border-black/5 pb-2.5">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-semibold uppercase tracking-wide text-ink-500">Stages</span>
            <span className="tabular-nums text-ink-700">
              <b className="text-ink-900">{summary.completedStages}</b>/{summary.totalStages} complete
            </span>
          </div>
          <ProgressBar value={summary.progressPct} showLabel size="sm" />
          <p className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-ink-500">{summary.status === "completed" ? "Finished at" : "Now at"}</span>
            <span className="min-w-0 truncate font-semibold text-ink-900">{summary.currentStageLabel}</span>
          </p>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-ink-500">Production (PCS)</span>
        <span className="tabular-nums text-ink-700">
          <b className="text-ink-900">{summary.productionQty.toLocaleString()}</b> ordered
          {summary.excessQty > 0 && <span className="text-ink-500"> · {summary.buyerQty.toLocaleString()} + {summary.excessQty.toLocaleString()} excess</span>}
        </span>
      </div>

      <div className="space-y-1.5">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-11 shrink-0 font-medium text-ink-600">{b.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
              <span className={`block h-full rounded-full ${b.color}`} style={{ width: `${Math.min(((b.value ?? 0) / base) * 100, 100)}%` }} />
            </span>
            <span className="w-14 shrink-0 text-right font-bold tabular-nums text-ink-900">{(b.value ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Chip label="Rejected" value={summary.rejectedPcs} tone={summary.rejectedPcs > 0 ? "bad" : "neutral"} title="Rejected pieces are gone for good - they are not rework" />
        <Chip label="In rework" value={summary.reworkPendingPcs} tone={summary.reworkPendingPcs > 0 ? "warn" : "neutral"} title="Sent to rework and not yet solved - still owed" />
        <Chip label="Balance" value={balance} tone={balance > 0 ? "info" : "good"} title="Production quantity less packed and rejected" />
      </div>

      <p className="flex flex-wrap items-center justify-between gap-x-2 text-[10px] text-ink-500">
        <span>
          {summary.lastEntryDate ? <>Last entry {formatDisplayDate(summary.lastEntryDate)}</> : "Nothing recorded yet"}
          {summary.entryCount > 0 && <> · {summary.entryCount.toLocaleString()} record{summary.entryCount === 1 ? "" : "s"}</>}
        </span>
        {summary.partialStages > 0 && <span className="font-semibold text-amber-700">{summary.partialStages} stage{summary.partialStages === 1 ? "" : "s"} owe a balance</span>}
      </p>
    </div>
  );
}

const CHIP_TONE = {
  bad: "border-rose-200 bg-rose-50 text-rose-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  neutral: "border-ink-100 bg-white text-ink-600",
} as const;

function Chip({ label, value, tone, title }: { label: string; value: number; tone: keyof typeof CHIP_TONE; title: string }) {
  return (
    <div title={title} className={`rounded-lg border px-1.5 py-1 ${CHIP_TONE[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-sm font-extrabold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

/**
 * The whole list's production position - the same figures as one order's strip,
 * summed over whichever orders are showing. Sits above the Orders and Output
 * lists so the numbers move as the search, buyer and status filters do.
 */
export function ProductionPositionCard({ totals, title = "Production position", subtitle }: { totals: ProductionTotals; title?: string; subtitle?: string }) {
  const tiles: { label: string; value: number; tone: string; hint?: string }[] = [
    { label: "Production qty", value: totals.productionQty, tone: "text-ink-900", hint: totals.excessQty > 0 ? `${totals.buyerQty.toLocaleString()} + ${totals.excessQty.toLocaleString()} excess` : "buyer quantity" },
    { label: "Cut", value: totals.cutPcs, tone: "text-violet-700" },
    { label: "Sewn", value: totals.sewnPcs, tone: "text-amber-600" },
    { label: "Packed", value: totals.packedPcs, tone: "text-emerald-700" },
    { label: "Rejected", value: totals.rejectedPcs, tone: totals.rejectedPcs > 0 ? "text-rose-600" : "text-ink-400", hint: "gone for good" },
    { label: "In rework", value: totals.reworkPendingPcs, tone: totals.reworkPendingPcs > 0 ? "text-amber-600" : "text-ink-400", hint: "still owed" },
    { label: "Balance", value: totals.balancePcs, tone: totals.balancePcs > 0 ? "text-sky-700" : "text-emerald-700", hint: "left to deliver" },
  ];
  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-900">{title}</h2>
        <p className="text-xs text-ink-500">{subtitle ?? `Across ${totals.orders.toLocaleString()} order${totals.orders === 1 ? "" : "s"} · PCS`}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-white/80 bg-gradient-to-br from-white to-ink-50/60 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{t.label}</p>
            <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${t.tone}`}>{t.value.toLocaleString()}</p>
            {t.hint && <p className="text-[10px] text-ink-400">{t.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
