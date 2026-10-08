"use client";

import { TNA_STATUS_META, computeTna, tnaChipText, type TnaRecord, type TnaResult, type TnaStatus } from "@/lib/tna";

/** The status as a pill: coloured dot + the status's own words. */
export function TnaStatusPill({ status, label, className = "" }: { status: TnaStatus; label?: string; className?: string }) {
  const m = TNA_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${className}`}
      style={{ backgroundColor: m.soft, color: m.text, borderColor: `${m.color}55` }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.needsAttention ? "animate-pulseSoft" : ""}`} style={{ backgroundColor: m.color }} />
      {label ?? m.label}
    </span>
  );
}

/** A compact chip with the figure that matters ("Early 2d", "Overdue 3h", "Due in 5h") - for beside a stage name. */
export function TnaChip({ result, className = "" }: { result: TnaResult; className?: string }) {
  const m = TNA_STATUS_META[result.status];
  return (
    <span
      title={result.headline}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[10px] font-bold ${className}`}
      style={{ backgroundColor: m.soft, color: m.text, borderColor: `${m.color}66` }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.needsAttention ? "animate-pulseSoft" : ""}`} style={{ backgroundColor: m.color }} />
      {tnaChipText(result)}
    </span>
  );
}

/** Convenience: compute + chip for a record at `now`. */
export function TnaRecordChip({ record, now, className }: { record: TnaRecord; now: number; className?: string }) {
  return <TnaChip result={computeTna(record, now)} className={className} />;
}
