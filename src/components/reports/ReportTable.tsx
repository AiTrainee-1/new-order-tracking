"use client";

import type { ReportRow } from "@/lib/reports";
import { Card } from "@/components/ui/Card";

/** The on-screen Order / Buyer / Stage / Entries / View Details table -
 *  exactly the shape that gets exported, so the screen and the file always
 *  agree. "View Details" opens the SAME public tracking dashboard the QR
 *  share card links to (see ShareQrModal) in a new tab. */
export function ReportTable({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-ink-500">No entries match these filters.</div>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-4 py-2.5 text-left font-semibold">Order</th>
            <th className="px-3 py-2.5 text-left font-semibold">Buyer</th>
            <th className="px-3 py-2.5 text-left font-semibold">Stage</th>
            <th className="px-3 py-2.5 text-right font-semibold">Entries</th>
            <th className="px-3 py-2.5 text-left font-semibold">View Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => (
            <tr key={`${r.orderId}::${r.stageSeq}`} className="bg-white">
              <td className="px-4 py-2.5 font-medium text-ink-900">
                <span className="font-semibold">{r.ioNo}</span> <span className="text-ink-400">· {r.style}</span>
              </td>
              <td className="px-3 py-2.5 text-ink-700">{r.buyerName ?? "-"}</td>
              <td className="px-3 py-2.5 text-ink-700">{r.stageLabel}</td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-brand">{r.entries}</td>
              <td className="px-3 py-2.5">
                <a href={`/share/output/${r.orderId}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
                  View Details →
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
