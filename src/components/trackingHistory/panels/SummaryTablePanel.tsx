"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { shortDateTime } from "@/lib/trackingHistory";

export interface SummaryColumn<T> {
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

/**
 * The one-table-per-report shape shared by User-Wise, Stage-Wise and
 * Order-Wise (each is just a different grouping of the same activity feed -
 * see lib/trackingActivity.ts). `onDrill`, when given, makes every row
 * clickable: it jumps to the Detailed Activity Report filtered down to
 * exactly that user/stage/order, which is how "pick a user and see exactly
 * what they did" is answered without a bespoke detail view per report type.
 */
export function SummaryTablePanel<T>({
  rows,
  columns,
  emptyLabel,
  drillLabel,
  onDrill,
}: {
  rows: T[];
  columns: SummaryColumn<T>[];
  emptyLabel: string;
  drillLabel?: (row: T) => string;
  onDrill?: (row: T) => void;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-ink-500">{emptyLabel}</div>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-2.5 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
            {onDrill && <th className="px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, ri) => (
            <tr key={ri} className="bg-white hover:bg-sky-50/60">
              {columns.map((c, ci) => (
                <td key={ci} className={`px-4 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                  {c.render(row)}
                </td>
              ))}
              {onDrill && (
                <td className="px-4 py-2.5 text-right">
                  <button type="button" onClick={() => onDrill(row)} className="text-xs font-semibold text-brand hover:underline">
                    {drillLabel?.(row) ?? "View activity →"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function dateTimeCell(iso: string | null): ReactNode {
  return <span className="text-ink-500">{shortDateTime(iso)}</span>;
}
