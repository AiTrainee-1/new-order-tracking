"use client";

import { useState } from "react";
import { TNA_STATUS_META, computeTna, formatDuration, tnaMilestones, type TnaEventRow, type TnaRecord, type TnaStatus } from "@/lib/tna";
import { describeVariance, fmtDateTime, fmtDateTimeSmart } from "@/lib/tnaFormat";
import { TnaStatusPill } from "./TnaStatusChip";

/** The shapes tna_events.data takes (see lib/server/tna.ts). */
interface PlanSnap {
  plannedStart?: string;
  plannedEnd?: string;
  graceMinutes?: number;
  notes?: string | null;
}
interface EventData extends PlanSnap {
  source?: string;
  previous?: PlanSnap;
  current?: PlanSnap;
  statusBefore?: string;
  statusAfter?: string;
  outcome?: string;
  headline?: string;
}

interface HistoryItem {
  at: string;
  title: string;
  detail?: string;
  tone: "neutral" | "good" | "warn" | "bad";
  /** A permanent record (an event) vs a milestone worked out from the current schedule. */
  recorded: boolean;
  future: boolean;
}

const TONE_DOT: Record<HistoryItem["tone"], string> = { neutral: "bg-ink-300", good: "bg-emerald-500", warn: "bg-orange-500", bad: "bg-rose-500" };

const statusLabel = (s: unknown) => (typeof s === "string" && s in TNA_STATUS_META ? TNA_STATUS_META[s as TnaStatus].label : null);

function describeEvent(e: TnaEventRow): { title: string; detail?: string; tone: HistoryItem["tone"] } {
  const d = e.data as EventData;
  if (e.kind === "assigned") {
    return {
      title: "TNA assigned",
      detail: `${fmtDateTime(d.plannedStart, true)} → ${fmtDateTime(d.plannedEnd, true)}${d.graceMinutes ? ` · grace ${formatDuration(d.graceMinutes)}` : ""}${d.source === "import" ? " · loaded from a TNA sheet" : ""}`,
      tone: "neutral",
    };
  }
  if (e.kind === "rescheduled") {
    const p = d.previous ?? {};
    const c = d.current ?? {};
    const parts: string[] = [];
    if (p.plannedStart !== c.plannedStart) parts.push(`start ${fmtDateTime(p.plannedStart)} → ${fmtDateTime(c.plannedStart)}`);
    if (p.plannedEnd !== c.plannedEnd) parts.push(`deadline ${fmtDateTime(p.plannedEnd)} → ${fmtDateTime(c.plannedEnd)}`);
    if (p.graceMinutes !== c.graceMinutes) parts.push(`grace ${formatDuration(p.graceMinutes ?? 0)} → ${formatDuration(c.graceMinutes ?? 0)}`);
    if ((p.notes ?? null) !== (c.notes ?? null)) parts.push("note changed");
    const before = statusLabel(d.statusBefore);
    const after = statusLabel(d.statusAfter);
    return { title: "TNA rescheduled", detail: `${parts.join(" · ")}${before && after && before !== after ? ` — status ${before} → ${after}` : ""}`, tone: "warn" };
  }
  if (e.kind === "cleared") {
    const before = statusLabel(d.statusBefore);
    return { title: "TNA removed", detail: before ? `It was: ${before}` : undefined, tone: "neutral" };
  }
  const outcome = statusLabel(d.outcome);
  return { title: String(d.headline ?? "Completed"), detail: outcome ? `Recorded outcome: ${outcome}` : undefined, tone: d.outcome === "completed_late" ? "bad" : d.outcome === "completed_grace" ? "warn" : "good" };
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-0.5 break-words text-[13px] font-bold leading-snug text-ink-900" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {sub && <p className="text-[11px] leading-snug text-ink-500">{sub}</p>}
    </div>
  );
}

/**
 * Everything TNA knows about one stage of one order: the schedule, what the
 * floor actually did, how the two compare (early / on time / late, by how
 * much), the grace period and how much of it was used, and the history of how
 * the schedule and its status have changed. The status here is computed from
 * `now`, so an open stage past its deadline reads as a live warning.
 *
 * `collapsible` is for where the card sits among other things (an order's workflow panel): it starts as
 * one slim line - the title, the one-line outcome and the status - and opens on click to show everything.
 * (The dialog that is all about this card shows it open.)
 */
export function TnaStageCard({ record, events, now, nameOf, collapsible = false }: { record: TnaRecord; events: TnaEventRow[]; now: number; nameOf?: (id: string) => string; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const r = computeTna(record, now);
  const meta = TNA_STATUS_META[r.status];
  const folded = collapsible && !open;

  // The permanent log plus the milestones of the current schedule, in time order.
  const history: HistoryItem[] = [];
  const mine = events.filter((e) => e.sectionId === record.sectionId);
  const hasCompletionEvent = mine.some((e) => e.kind === "completed");
  for (const e of mine) {
    const d = describeEvent(e);
    const who = e.actorId && nameOf ? nameOf(e.actorId) : null;
    history.push({ at: e.at, title: d.title, detail: [d.detail, who && e.kind !== "completed" ? `by ${who}` : null].filter(Boolean).join(" · "), tone: d.tone, recorded: true, future: false });
  }
  for (const m of tnaMilestones(record, now)) {
    if (m.key === "completed" && hasCompletionEvent) continue;
    history.push({ at: m.at, title: m.label, tone: m.tone, recorded: false, future: new Date(m.at).getTime() > now });
  }
  history.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const graceUsedPct = r.graceTotalMin > 0 ? Math.min(Math.round((r.graceUsedMin / r.graceTotalMin) * 100), 100) : 0;

  return (
    <div className={`rounded-2xl border bg-white/70 ${folded ? "p-3" : "space-y-4 p-4"}`} style={{ borderColor: `${meta.color}55`, boxShadow: `inset 4px 0 0 ${meta.color}` }}>
      {(() => {
        const head = (
          <>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-ink-900">TNA - Time &amp; Action</p>
              {folded ? (
                <p className="truncate text-xs font-semibold" style={{ color: meta.text }}>
                  {r.headline}
                </p>
              ) : (
                <p className="text-xs text-ink-500">Planned against what the floor actually recorded.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TnaStatusPill status={r.status} />
              {collapsible && (
                <span className="flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-ink-600">
                  {open ? "Hide details" : "Show details"}
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              )}
            </div>
          </>
        );
        return collapsible ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
            {head}
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">{head}</div>
        );
      })()}

      {!folded && (
        <>
          <p className="text-sm font-semibold" style={{ color: meta.text }}>
            {r.headline}
            {record.isPartial && !r.isCompleted && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">moved on, not complete</span>}
          </p>

          {meta.needsAttention && (
            <div className="rounded-xl border px-3 py-2 text-xs font-medium" style={{ backgroundColor: meta.soft, borderColor: `${meta.color}55`, color: meta.text }}>
              {r.status === "critical"
                ? r.graceTotalMin > 0
                  ? "The deadline and the grace period have both passed and this stage is still open. This stays flagged until it is completed with “Completed – Move Forward”."
                  : "The deadline has passed and this stage is still open. This stays flagged until it is completed with “Completed – Move Forward”."
                : `The deadline has passed - this stage is in its grace period (${formatDuration(r.graceTotalMin - r.graceUsedMin)} left). This stays flagged until it is completed with “Completed – Move Forward”.`}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 2xl:grid-cols-3">
            <Tile label="Planned start" value={fmtDateTimeSmart(record.plannedStart)} />
            <Tile label="Planned end" value={fmtDateTimeSmart(record.plannedEnd)} sub={`Planned duration ${formatDuration(r.plannedDurationMin)}`} />
            <Tile label="Excess / grace time" value={r.graceTotalMin > 0 ? formatDuration(r.graceTotalMin) : "None"} sub={r.graceTotalMin > 0 ? `Until ${fmtDateTimeSmart(r.graceEndAt)}` : undefined} />
            <Tile
              label="Actual start"
              value={record.actualStartAt ? fmtDateTimeSmart(record.actualStartAt) : "-"}
              sub={r.startVarianceMin !== null && r.startVarianceMin !== 0 ? `${describeVariance(r.startVarianceMin, "before plan", "after plan")}` : record.actualStartAt ? "on plan" : "Nothing recorded yet"}
            />
            <Tile label="Actual completion" value={record.completedAt ? fmtDateTimeSmart(record.completedAt) : "Still open"} sub={record.frozen ? "Locked into the record" : undefined} />
            <Tile
              label={r.isCompleted ? "Actual duration" : "Running for"}
              value={r.actualDurationMin === null ? "-" : formatDuration(r.actualDurationMin)}
              sub={r.actualDurationMin !== null ? `vs ${formatDuration(r.plannedDurationMin)} planned` : undefined}
            />
            {r.isCompleted && r.earlyMin > 0 && <Tile label="Early completion" value={formatDuration(r.earlyMin)} sub="before the deadline" tone={TNA_STATUS_META.completed_early.color} />}
            {r.delayMin > 0 && <Tile label={r.isCompleted ? "Delay" : "Overdue by"} value={formatDuration(r.delayMin)} sub="past the planned end" tone={r.status === "grace" || r.status === "completed_grace" ? TNA_STATUS_META.grace.color : TNA_STATUS_META.critical.color} />}
            {!r.isCompleted && r.dueInMin !== null && r.dueInMin > 0 && <Tile label="Due in" value={formatDuration(r.dueInMin)} sub={`by ${fmtDateTime(record.plannedEnd)}`} />}
            {r.graceTotalMin > 0 && <Tile label="Grace used" value={`${formatDuration(r.graceUsedMin)} of ${formatDuration(r.graceTotalMin)}`} sub={r.status === "critical" || r.status === "completed_late" ? "Grace period used up" : undefined} />}
          </div>

          {r.graceTotalMin > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                <span>Grace period</span>
                <span>{graceUsedPct}% used</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full" style={{ width: `${graceUsedPct}%`, backgroundColor: graceUsedPct >= 100 ? TNA_STATUS_META.critical.color : TNA_STATUS_META.grace.color }} />
              </div>
            </div>
          )}

          {record.notes && <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700">Note: {record.notes}</p>}

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">History</p>
            <ol className="relative space-y-3 border-l border-ink-200 pl-4">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative">
                  <span className={`absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${h.future ? "bg-white ring-ink-300" : TONE_DOT[h.tone]}`} style={h.future ? { boxShadow: "inset 0 0 0 2px #CBD5E1" } : undefined} />
                  <p className={`text-xs font-semibold ${h.future ? "text-ink-400" : "text-ink-900"}`}>
                    {h.title}
                    {h.recorded && <span className="ml-1.5 rounded bg-ink-100 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-ink-500">logged</span>}
                    {h.future && <span className="ml-1.5 text-[10px] font-medium text-ink-400">(upcoming)</span>}
                  </p>
                  <p className="text-[11px] text-ink-500">{fmtDateTime(h.at, true)}</p>
                  {h.detail && <p className="text-[11px] text-ink-600">{h.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
