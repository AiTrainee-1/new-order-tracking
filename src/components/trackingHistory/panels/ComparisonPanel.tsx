"use client";

import type { ComparisonRow, TodayVsYesterday } from "@/lib/trackingActivity";
import { Card } from "@/components/ui/Card";

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) return <span className="text-ink-400">±0</span>;
  const good = diff > 0;
  return <span className={`font-bold ${good ? "text-emerald-600" : "text-rose-600"}`}>{good ? `+${diff}` : diff}</span>;
}

function CompareTable({ title, rows, emptyLabel }: { title: string; rows: ComparisonRow[]; emptyLabel: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-l-4 border-l-indigo-500 bg-indigo-50/70 px-4 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-900">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-400">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-right font-semibold">Today</th>
                <th className="px-3 py-2 text-right font-semibold">Yesterday</th>
                <th className="px-3 py-2 text-right font-semibold">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={r.key} className="bg-white">
                  <td className="px-4 py-2 font-medium text-ink-800">{r.label}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand">{r.today}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-500">{r.yesterday}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <DiffBadge diff={r.diff} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Today vs Yesterday - always the literal two days, regardless of the
 *  report tabs' own date filter (comparing "today" against a date range
 *  wouldn't mean anything); the shared Buyer/Order/User/Stage filters still
 *  narrow which activity counts on each side. */
export function ComparisonPanel({ comparison }: { comparison: TodayVsYesterday }) {
  const { totals, orders } = comparison;
  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <Scoreboard label="Total Entries" today={totals.today} yesterday={totals.yesterday} diff={totals.diff} />
        <Scoreboard label="Orders Processed" today={orders.today} yesterday={orders.yesterday} diff={orders.diff} />
        <Scoreboard label="Users Active" today={comparison.byUser.filter((u) => u.today > 0).length} yesterday={comparison.byUser.filter((u) => u.yesterday > 0).length} diff={comparison.byUser.filter((u) => u.today > 0).length - comparison.byUser.filter((u) => u.yesterday > 0).length} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CompareTable title="By User" rows={comparison.byUser} emptyLabel="No user activity on either day." />
        <CompareTable title="By Stage" rows={comparison.byStage} emptyLabel="No stage activity on either day." />
        <CompareTable title="By Order" rows={comparison.byOrder} emptyLabel="No order activity on either day." />
      </div>
    </div>
  );
}

function Scoreboard({ label, today, yesterday, diff }: { label: string; today: number; yesterday: number; diff: number }) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <div className="mt-1 flex items-center justify-center gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-ink-900">{today}</p>
          <p className="text-[10px] font-semibold uppercase text-brand">Today</p>
        </div>
        <span className="text-ink-300">vs</span>
        <div>
          <p className="text-2xl font-bold tabular-nums text-ink-400">{yesterday}</p>
          <p className="text-[10px] font-semibold uppercase text-ink-400">Yesterday</p>
        </div>
      </div>
      <p className="mt-1 text-sm">
        <DiffBadge diff={diff} />
      </p>
    </div>
  );
}
