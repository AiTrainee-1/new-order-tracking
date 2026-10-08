/**
 * TNA - Time & Action: the rules that turn a stage's SCHEDULE and what the floor
 * actually did into a status. Pure functions, no I/O, used identically by the
 * server (reports, alerts) and the browser (which re-runs them every minute, so
 * "due in 5h" becomes "overdue by 1h" on its own).
 *
 * The inputs are four moments:
 *   plannedStart / plannedEnd  - what was planned (typed on the Assignment page)
 *   graceMinutes               - optional extra time tolerated after plannedEnd
 *   actualStartAt              - when the first activity on the stage was recorded
 *   completedAt                - when "Completed - Move Forward" was pressed
 * and `now`. Nothing here ever blocks the production workflow - it only reports.
 *
 *   plannedEnd ──── graceEnd
 *   done before plannedEnd ........ early / on time        (green)
 *   done in (plannedEnd, graceEnd]  completed in grace      (orange)
 *   done after graceEnd ........... completed late          (red)
 *   still open, past plannedEnd ... warning while in grace  (orange)
 *   still open, past graceEnd ..... critical / overdue      (red)
 */

export type TnaStatus =
  | "upcoming"
  | "in_progress"
  | "grace"
  | "critical"
  | "completed_early"
  | "completed_on_time"
  | "completed_grace"
  | "completed_late";

/** Finishing at least this long before the planned end counts as "early" rather than "on time". */
export const EARLY_THRESHOLD_MIN = 60;
/** "Due soon": an open stage whose planned end is within this many minutes. */
export const DUE_SOON_MIN = 48 * 60;

const MIN = 60_000;

export interface TnaTimes {
  plannedStart: string;
  plannedEnd: string;
  graceMinutes: number;
  actualStartAt: string | null;
  completedAt: string | null;
}

export interface TnaResult {
  status: TnaStatus;
  isCompleted: boolean;
  /** Still open and past its planned end - overdue right now (grace or critical). */
  isOverdue: boolean;
  /** Open, started late: its planned start has passed and nothing has been recorded yet. */
  lateStart: boolean;
  /** Open and the planned end is within DUE_SOON_MIN (and not yet past). */
  dueSoon: boolean;
  graceEndAt: string;
  plannedDurationMin: number;
  /** Start -> completion (or -> now while open). Null until something has been recorded. */
  actualDurationMin: number | null;
  /** Minutes past the planned end: at completion if finished, otherwise so far. 0 if not late. */
  delayMin: number;
  /** Minutes finished before the planned end. 0 unless completed early/on time. */
  earlyMin: number;
  graceTotalMin: number;
  /** How much of the grace window was used (completion time, or now while open). */
  graceUsedMin: number;
  /** Actual start minus planned start: negative = started early, positive = started late. */
  startVarianceMin: number | null;
  /** Planned end minus now for an open stage (negative once overdue). Null when completed. */
  dueInMin: number | null;
  /** One-line summary, e.g. "Completed 2d early", "Overdue by 3h", "Due in 5h". */
  headline: string;
}

export interface TnaStatusMeta {
  label: string;
  /** A few characters for a chip beside a stage name. */
  short: string;
  color: string;
  soft: string;
  text: string;
  isCompleted: boolean;
  /** Needs someone's eyes now (warning or danger). */
  needsAttention: boolean;
  /** Sort key for "most urgent first". */
  rank: number;
}

export const TNA_STATUS_META: Record<TnaStatus, TnaStatusMeta> = {
  critical: { label: "Overdue / Critical", short: "Critical", color: "#E11D48", soft: "#FFF1F3", text: "#9F1239", isCompleted: false, needsAttention: true, rank: 0 },
  grace: { label: "Warning - in grace period", short: "Grace", color: "#F97316", soft: "#FFF5EB", text: "#C2410C", isCompleted: false, needsAttention: true, rank: 1 },
  in_progress: { label: "In progress", short: "On plan", color: "#2563EB", soft: "#EFF5FF", text: "#1D4ED8", isCompleted: false, needsAttention: false, rank: 3 },
  upcoming: { label: "Upcoming", short: "Upcoming", color: "#EAB308", soft: "#FEFCE8", text: "#A16207", isCompleted: false, needsAttention: false, rank: 4 },
  completed_late: { label: "Completed late", short: "Late", color: "#DC2626", soft: "#FEF2F2", text: "#991B1B", isCompleted: true, needsAttention: false, rank: 2 },
  completed_grace: { label: "Completed in grace period", short: "In grace", color: "#EA8A00", soft: "#FFF8E6", text: "#B45309", isCompleted: true, needsAttention: false, rank: 5 },
  completed_on_time: { label: "Completed on time", short: "On time", color: "#16A34A", soft: "#F0FDF4", text: "#166534", isCompleted: true, needsAttention: false, rank: 6 },
  completed_early: { label: "Completed early", short: "Early", color: "#0D9488", soft: "#F0FDFA", text: "#115E59", isCompleted: true, needsAttention: false, rank: 7 },
};

/** Every status, in the order the legend and filters list them. */
export const TNA_STATUS_ORDER: TnaStatus[] = ["critical", "grace", "in_progress", "upcoming", "completed_late", "completed_grace", "completed_on_time", "completed_early"];

/** "2d 4h", "5h 30m", "45m" - a length of time, never negative. */
export function formatDuration(minutes: number): string {
  const total = Math.max(Math.round(Math.abs(minutes)), 0);
  if (total < 1) return "0m";
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

const toMs = (iso: string) => new Date(iso).getTime();

export function computeTna(t: TnaTimes, now: number | Date = Date.now()): TnaResult {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const start = toMs(t.plannedStart);
  const end = toMs(t.plannedEnd);
  const grace = Math.max(Math.round(t.graceMinutes || 0), 0);
  const graceEnd = end + grace * MIN;
  const actualStart = t.actualStartAt ? toMs(t.actualStartAt) : null;
  const completed = t.completedAt ? toMs(t.completedAt) : null;
  const isCompleted = completed !== null;

  let status: TnaStatus;
  if (isCompleted) {
    if (completed <= end) status = end - completed >= EARLY_THRESHOLD_MIN * MIN ? "completed_early" : "completed_on_time";
    else if (grace > 0 && completed <= graceEnd) status = "completed_grace";
    else status = "completed_late";
  } else if (nowMs <= end) {
    // Before the planned start it is "upcoming" - unless work has already begun.
    status = nowMs < start && actualStart === null ? "upcoming" : "in_progress";
  } else if (grace > 0 && nowMs <= graceEnd) {
    status = "grace";
  } else {
    status = "critical";
  }

  const ref = completed ?? nowMs;
  const delayMin = Math.max(Math.round((ref - end) / MIN), 0);
  const earlyMin = isCompleted ? Math.max(Math.round((end - completed) / MIN), 0) : 0;
  const graceUsedMin = grace > 0 ? Math.min(Math.max(Math.round((ref - end) / MIN), 0), grace) : 0;
  const plannedDurationMin = Math.max(Math.round((end - start) / MIN), 0);
  const actualDurationMin = actualStart === null ? null : Math.max(Math.round((ref - actualStart) / MIN), 0);
  const startVarianceMin = actualStart === null ? null : Math.round((actualStart - start) / MIN);
  const dueInMin = isCompleted ? null : Math.round((end - nowMs) / MIN);
  const isOverdue = !isCompleted && nowMs > end;
  const lateStart = !isCompleted && actualStart === null && nowMs > start;
  const dueSoon = !isCompleted && nowMs <= end && end - nowMs <= DUE_SOON_MIN * MIN;

  let headline: string;
  switch (status) {
    case "completed_early":
      headline = `Completed ${formatDuration(earlyMin)} early`;
      break;
    case "completed_on_time":
      headline = "Completed on time";
      break;
    case "completed_grace":
      headline = `Completed ${formatDuration(delayMin)} late - within the grace period`;
      break;
    case "completed_late":
      headline = `Completed ${formatDuration(delayMin)} late${grace > 0 ? " - past the grace period" : ""}`;
      break;
    case "critical":
      headline = grace > 0 ? `Critical - ${formatDuration(delayMin)} overdue, grace period used up` : `Overdue by ${formatDuration(delayMin)}`;
      break;
    case "grace":
      headline = `Overdue by ${formatDuration(delayMin)} - ${formatDuration((graceEnd - nowMs) / MIN)} of grace left`;
      break;
    case "in_progress":
      headline = lateStart ? `Not started - was due to begin ${formatDuration((nowMs - start) / MIN)} ago` : `Due in ${formatDuration((dueInMin ?? 0))}`;
      break;
    default:
      headline = `Starts in ${formatDuration((start - nowMs) / MIN)}`;
  }

  return {
    status,
    isCompleted,
    isOverdue,
    lateStart,
    dueSoon,
    graceEndAt: new Date(graceEnd).toISOString(),
    plannedDurationMin,
    actualDurationMin,
    delayMin,
    earlyMin,
    graceTotalMin: grace,
    graceUsedMin,
    startVarianceMin,
    dueInMin,
    headline,
  };
}

/** The text for a small chip beside a stage name: "Early 2d", "Late 1d 3h", "Due in 5h"... */
export function tnaChipText(r: TnaResult): string {
  switch (r.status) {
    case "completed_early":
      return `Early ${formatDuration(r.earlyMin)}`;
    case "completed_on_time":
      return "On time";
    case "completed_grace":
      return `Late ${formatDuration(r.delayMin)} · grace`;
    case "completed_late":
      return `Late ${formatDuration(r.delayMin)}`;
    case "critical":
      return `Overdue ${formatDuration(r.delayMin)}`;
    case "grace":
      return `Grace · ${formatDuration(r.delayMin)} over`;
    case "in_progress":
      return r.lateStart ? "Not started" : `Due in ${formatDuration(r.dueInMin ?? 0)}`;
    default:
      return "Upcoming";
  }
}

export interface TnaMilestone {
  at: string;
  key: string;
  label: string;
  /** "plan" milestones are scheduled; "actual" ones are what the floor did; "alert" are the thresholds crossed. */
  kind: "plan" | "actual" | "alert";
  tone: "neutral" | "good" | "warn" | "bad";
}

/**
 * The moments in this stage's life, in time order, worked out from the plan and
 * the actuals: scheduled start, first activity, the planned deadline (and
 * whether it was crossed), the end of the grace period (and whether it was
 * crossed), completion. Only moments that have happened - or are still ahead -
 * are included, so it reads as a status history for the current schedule.
 */
export function tnaMilestones(t: TnaTimes, now: number | Date = Date.now()): TnaMilestone[] {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const end = toMs(t.plannedEnd);
  const grace = Math.max(Math.round(t.graceMinutes || 0), 0);
  const graceEnd = end + grace * MIN;
  const completed = t.completedAt ? toMs(t.completedAt) : null;
  const out: TnaMilestone[] = [{ at: t.plannedStart, key: "planned_start", label: "Planned start", kind: "plan", tone: "neutral" }];

  if (t.actualStartAt) {
    const late = toMs(t.actualStartAt) > toMs(t.plannedStart);
    out.push({ at: t.actualStartAt, key: "actual_start", label: late ? "Work started (after the planned start)" : "Work started", kind: "actual", tone: late ? "warn" : "good" });
  }
  out.push({ at: t.plannedEnd, key: "planned_end", label: "Planned end (deadline)", kind: "plan", tone: "neutral" });

  // Crossed the deadline while still open -> the warning started here.
  if ((completed === null && nowMs > end) || (completed !== null && completed > end)) {
    out.push({
      at: t.plannedEnd,
      key: "overdue_from",
      label: grace > 0 ? "Warning began - deadline passed, grace period started" : "Overdue began - deadline passed",
      kind: "alert",
      tone: grace > 0 ? "warn" : "bad",
    });
  }
  if (grace > 0) {
    out.push({ at: new Date(graceEnd).toISOString(), key: "grace_end", label: "Grace period ends", kind: "plan", tone: "neutral" });
    if ((completed === null && nowMs > graceEnd) || (completed !== null && completed > graceEnd)) {
      out.push({ at: new Date(graceEnd).toISOString(), key: "critical_from", label: "Critical - grace period used up", kind: "alert", tone: "bad" });
    }
  }
  if (completed !== null) {
    const r = computeTna(t, nowMs);
    out.push({ at: t.completedAt!, key: "completed", label: r.headline, kind: "actual", tone: r.status === "completed_late" ? "bad" : r.status === "completed_grace" ? "warn" : "good" });
  }
  // Stable by time; on a tie keep the order they were pushed (plan before alert).
  return out.map((m, i) => ({ m, i })).sort((a, b) => toMs(a.m.at) - toMs(b.m.at) || a.i - b.i).map((x) => x.m);
}

/** The plan and the actual times, as the API sends them. */
export interface TnaRecord extends TnaTimes {
  id: string;
  orderId: string;
  sectionId: string;
  stageKey: string;
  stageLabel: string;
  stageSeq: number;
  unitType: string;
  notes: string | null;
  source: string;
  /** Moved forward without being completed - the stage is still open. */
  isPartial: boolean;
  lastActivityAt: string | null;
  /** True once the completion has been frozen onto the plan (survives later edits to the entries). */
  frozen: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  /** Present on the cross-order overview, so a row can be shown without another lookup. */
  order?: {
    id: string;
    ioNo: string;
    style: string;
    color: string | null;
    deliveryDate: string | null;
    isHidden: boolean;
    /** The order's photo (see orderImageUrl) - null when it has none. */
    imageId: string | null;
    buyer: { id: string; name: string } | null;
  };
}

export interface TnaEventRow {
  id: string;
  planId: string | null;
  orderId: string;
  sectionId: string;
  stageKey: string;
  kind: "assigned" | "rescheduled" | "cleared" | "completed";
  at: string;
  actorId: string | null;
  data: Record<string, unknown>;
}

/** The "datetime-local" input value (local time, no zone) for an ISO timestamp. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A "datetime-local" value (read in the browser's own time zone) as an ISO timestamp. */
export function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Grace time is typed as a number plus a unit; the database keeps minutes. */
export type GraceUnit = "hours" | "days";
export const graceToMinutes = (value: number, unit: GraceUnit): number => Math.max(Math.round(value * (unit === "days" ? 1440 : 60)), 0);
/** The most natural way to show a grace length back: whole days if it divides evenly, else hours. */
export function minutesToGrace(minutes: number): { value: number; unit: GraceUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  return { value: Math.round((minutes / 60) * 100) / 100, unit: "hours" };
}
