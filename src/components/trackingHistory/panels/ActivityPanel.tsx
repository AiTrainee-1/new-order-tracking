"use client";

import { useMemo, useState } from "react";
import type { SequencedRecord } from "@/lib/trackingActivity";
import { shortDateTime, timeOnly } from "@/lib/trackingHistory";
import { Card } from "@/components/ui/Card";

const PAGE_SIZE = 50;

/**
 * The Detailed Activity Report - the raw, time-ordered log every other
 * activity-based report is a grouping of. `sequence` is each record's
 * position within its OWN user's timeline (entry #1, #2, ... for THAT
 * person), which is what answers "what did they do, in what order".
 */
export function ActivityPanel({ records }: { records: SequencedRecord[] }) {
  const [page, setPage] = useState(1);
  const sorted = useMemo(() => [...records].sort((a, b) => b.at.localeCompare(a.at)), [records]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  if (records.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-ink-500">No activity matches these filters.</div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-sm">
          <thead>
            <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
              <th className="px-4 py-2.5 text-left font-semibold">Date &amp; Time</th>
              <th className="px-3 py-2.5 text-left font-semibold">User</th>
              <th className="px-3 py-2.5 text-left font-semibold">Order</th>
              <th className="px-3 py-2.5 text-left font-semibold">Stage</th>
              <th className="px-3 py-2.5 text-left font-semibold">Action</th>
              <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
              <th className="px-3 py-2.5 text-right font-semibold">Seq #</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {pageRows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">
                  {shortDateTime(r.at).split(",")[0]}, <span className="font-semibold text-ink-700">{timeOnly(r.at)}</span>
                </td>
                <td className="px-3 py-2.5 font-medium text-ink-800">{r.userName}</td>
                <td className="px-3 py-2.5 text-ink-700">
                  <span className="font-semibold">{r.ioNo}</span> <span className="text-ink-400">· {r.style}</span>
                </td>
                <td className="px-3 py-2.5 text-ink-700">{r.stageLabel}</td>
                <td className="px-3 py-2.5 text-ink-600">{r.action}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{r.qty != null ? `${r.qty.toLocaleString()}${r.unit ? ` ${r.unit}` : ""}` : "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-400">#{r.sequence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-ink-500">
          <span>
            Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, sorted.length)} of {sorted.length.toLocaleString()} entries
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded-md border border-ink-200 px-2.5 py-1 font-semibold disabled:opacity-40">
              ← Prev
            </button>
            <button type="button" disabled={current >= totalPages} onClick={() => setPage(current + 1)} className="rounded-md border border-ink-200 px-2.5 py-1 font-semibold disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
