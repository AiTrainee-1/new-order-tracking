import { TNA_STATUS_META, computeTna, formatDuration, type TnaRecord, type TnaResult, type TnaStatus } from "./tna";
import { buildCsv, datedCsvName, downloadCsv } from "./csv";
import { fmtDateTime } from "./tnaFormat";

/**
 * What the TNA View can be narrowed to. The grouped keys answer the questions
 * asked of it ("what needs attention", "what is late", "what is due soon"); the
 * rest are single statuses, which is what clicking the overview bar selects.
 */
export type TnaFilter = "all" | "attention" | "delayed" | "due_soon" | "completed" | TnaStatus;

export const TNA_FILTER_TABS: { key: TnaFilter; label: string; tone?: "good" | "warn" | "bad" | "neutral" | "info" }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention", tone: "bad" },
  { key: "delayed", label: "Delayed", tone: "warn" },
  { key: "due_soon", label: "Due soon", tone: "warn" },
  { key: "upcoming", label: "Upcoming", tone: "neutral" },
  { key: "completed", label: "Completed", tone: "good" },
  { key: "completed_early", label: "Early", tone: "good" },
];

export function matchesTnaFilter(r: TnaResult, f: TnaFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "attention":
      return r.status === "critical" || r.status === "grace";
    // Anything that ran or is running past its deadline - open or finished.
    case "delayed":
      return r.status === "critical" || r.status === "grace" || r.status === "completed_late" || r.status === "completed_grace";
    case "due_soon":
      return r.dueSoon;
    case "completed":
      return r.isCompleted;
    default:
      return r.status === f;
  }
}

/** Does this stage's planned window (with its grace) overlap [from, to] (local dates, inclusive)? Either bound may be empty. */
export function overlapsRange(r: TnaRecord, from: string, to: string): boolean {
  const start = new Date(r.plannedStart).getTime();
  const end = new Date(r.plannedEnd).getTime() + r.graceMinutes * 60_000;
  const lo = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const hi = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
  return start <= hi && end >= lo;
}

export function recordSearchText(r: TnaRecord): string {
  const o = r.order;
  return [o?.ioNo, o?.style, o?.color, o?.buyer?.name, r.stageLabel, r.notes].filter(Boolean).join(" ").toLowerCase();
}

/** Exports exactly what is on screen: every column of the TNA record. */
export function exportTnaCsv(records: TnaRecord[], now: number): void {
  const head = [
    "Buyer", "IO", "Style", "Colour", "Stage", "Status", "Planned start", "Planned end", "Excess / grace", "Grace deadline", "Actual start", "Actual completion",
    "Planned duration", "Actual duration", "Completed early by", "Delay / overdue by", "Grace used", "Start variance (min)", "Completion state", "Critical", "Notes",
  ];
  const rows = records.map((rec) => {
    const r = computeTna(rec, now);
    return [
      rec.order?.buyer?.name ?? "",
      rec.order?.ioNo ?? "",
      rec.order?.style ?? "",
      rec.order?.color ?? "",
      rec.stageLabel,
      TNA_STATUS_META[r.status].label,
      fmtDateTime(rec.plannedStart, true),
      fmtDateTime(rec.plannedEnd, true),
      r.graceTotalMin > 0 ? formatDuration(r.graceTotalMin) : "",
      r.graceTotalMin > 0 ? fmtDateTime(r.graceEndAt, true) : "",
      rec.actualStartAt ? fmtDateTime(rec.actualStartAt, true) : "",
      rec.completedAt ? fmtDateTime(rec.completedAt, true) : "",
      formatDuration(r.plannedDurationMin),
      r.actualDurationMin === null ? "" : formatDuration(r.actualDurationMin),
      r.earlyMin > 0 ? formatDuration(r.earlyMin) : "",
      r.delayMin > 0 ? formatDuration(r.delayMin) : "",
      r.graceTotalMin > 0 ? `${formatDuration(r.graceUsedMin)} of ${formatDuration(r.graceTotalMin)}` : "",
      r.startVarianceMin ?? "",
      r.isCompleted ? "Completed" : rec.isPartial ? "Moved on, not complete" : "Open",
      r.status === "critical" || r.status === "completed_late" ? "Yes" : "",
      rec.notes ?? "",
    ] as (string | number)[];
  });
  downloadCsv(datedCsvName("tna"), buildCsv(head, rows));
}
