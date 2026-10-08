"use client";

import { useMemo, useState } from "react";
import { TNA_STATUS_META, computeTna, formatDuration, type TnaRecord } from "@/lib/tna";
import { fmtDateTime } from "@/lib/tnaFormat";
import { TnaStatusPill } from "./TnaStatusChip";

type SortKey = "urgency" | "order" | "start" | "end";

function Th({ children, k, sort, onSort }: { children: React.ReactNode; k?: SortKey; sort: SortKey; onSort: (k: SortKey) => void }) {
  return (
    <th className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-ink-500">
      {k ? (
        <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-ink-900 ${sort === k ? "text-brand" : ""}`}>
          {children}
          {sort === k && <span aria-hidden>▾</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/**
 * Every TNA record as a table - all the figures behind the timeline: planned
 * and actual times, durations, early / delay, grace use and the current status.
 * Row click opens the stage's full record and history.
 */
export function TnaRecordsTable({ records, now, onSelect }: { records: TnaRecord[]; now: number; onSelect: (record: TnaRecord) => void }) {
  const [sort, setSort] = useState<SortKey>("urgency");

  const rows = useMemo(() => {
    const list = records.map((record) => ({ record, r: computeTna(record, now) }));
    const t = (iso: string) => new Date(iso).getTime();
    return list.sort((a, b) => {
      switch (sort) {
        case "order":
          return (a.record.order?.ioNo ?? "").localeCompare(b.record.order?.ioNo ?? "", undefined, { numeric: true }) || a.record.stageSeq - b.record.stageSeq;
        case "start":
          return t(a.record.plannedStart) - t(b.record.plannedStart);
        case "end":
          return t(a.record.plannedEnd) - t(b.record.plannedEnd);
        default:
          return TNA_STATUS_META[a.r.status].rank - TNA_STATUS_META[b.r.status].rank || t(a.record.plannedEnd) - t(b.record.plannedEnd);
      }
    });
  }, [records, now, sort]);

  if (records.length === 0) return <p className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-4 py-10 text-center text-sm text-ink-500">No scheduled stages match these filters.</p>;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.12)]">
      <div className="max-h-[72vh] overflow-auto">
        <table className="w-full min-w-[1280px] text-xs">
          <thead className="sticky top-0 z-10 bg-ink-50">
            <tr className="border-b border-ink-100">
              <Th k="order" sort={sort} onSort={setSort}>Order</Th>
              <Th sort={sort} onSort={setSort}>Stage</Th>
              <Th k="urgency" sort={sort} onSort={setSort}>Status</Th>
              <Th k="start" sort={sort} onSort={setSort}>Planned start</Th>
              <Th k="end" sort={sort} onSort={setSort}>Planned end</Th>
              <Th sort={sort} onSort={setSort}>Grace</Th>
              <Th sort={sort} onSort={setSort}>Actual start</Th>
              <Th sort={sort} onSort={setSort}>Actual completion</Th>
              <Th sort={sort} onSort={setSort}>Planned dur.</Th>
              <Th sort={sort} onSort={setSort}>Actual dur.</Th>
              <Th sort={sort} onSort={setSort}>Early / delay</Th>
              <Th sort={sort} onSort={setSort}>Grace used</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map(({ record, r }) => (
              <tr key={record.id} onClick={() => onSelect(record)} className="cursor-pointer transition-colors hover:bg-brand/[0.04]">
                <td className="min-w-[210px] px-3 py-2">
                  <p className="font-bold text-ink-900">
                    IO {record.order?.ioNo} · {record.order?.style}
                  </p>
                  <p className="text-[11px] text-ink-500">{[record.order?.color, record.order?.buyer?.name].filter(Boolean).join(" · ") || "-"}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink-800">
                  {record.stageSeq}. {record.stageLabel}
                </td>
                <td className="px-3 py-2">
                  <TnaStatusPill status={r.status} />
                  {record.isPartial && !r.isCompleted && <p className="mt-0.5 text-[10px] font-semibold text-amber-700">moved on, not complete</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">{fmtDateTime(record.plannedStart)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums font-semibold text-ink-900">{fmtDateTime(record.plannedEnd)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">{r.graceTotalMin > 0 ? formatDuration(r.graceTotalMin) : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">{record.actualStartAt ? fmtDateTime(record.actualStartAt) : <span className="text-ink-400">not started</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">{record.completedAt ? fmtDateTime(record.completedAt) : <span className="text-ink-400">open</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">{formatDuration(r.plannedDurationMin)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">{r.actualDurationMin === null ? "-" : formatDuration(r.actualDurationMin)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-bold tabular-nums">
                  {r.earlyMin > 0 ? (
                    <span style={{ color: TNA_STATUS_META.completed_early.color }}>{formatDuration(r.earlyMin)} early</span>
                  ) : r.delayMin > 0 ? (
                    <span style={{ color: r.status === "grace" || r.status === "completed_grace" ? TNA_STATUS_META.grace.color : TNA_STATUS_META.critical.color }}>
                      {formatDuration(r.delayMin)} {r.isCompleted ? "late" : "overdue"}
                    </span>
                  ) : r.isCompleted ? (
                    <span className="text-ink-500">on time</span>
                  ) : (
                    <span className="text-ink-400">due in {formatDuration(r.dueInMin ?? 0)}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">{r.graceTotalMin > 0 ? `${formatDuration(r.graceUsedMin)} / ${formatDuration(r.graceTotalMin)}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
