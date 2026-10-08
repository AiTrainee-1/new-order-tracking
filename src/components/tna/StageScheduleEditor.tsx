"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import { useNow, useOrderTna, useSaveOrderTna } from "@/hooks/useTna";
import type { OrderListRow } from "@/hooks/useOrdersList";
import { computeTna, formatDuration, graceToMinutes, isoToLocalInput, localInputToIso, minutesToGrace, type GraceUnit, type TnaRecord } from "@/lib/tna";
import { fmtDateTime } from "@/lib/tnaFormat";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { Input, Select } from "@/components/ui/FormControls";
import { AccentCard, SectionTitle } from "@/components/ui/SectionCard";
import { CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TnaChip } from "./TnaStatusChip";

interface RowDraft {
  start: string;
  end: string;
  graceValue: string;
  graceUnit: GraceUnit;
  notes: string;
}
const BLANK: RowDraft = { start: "", end: "", graceValue: "", graceUnit: "days", notes: "" };

const toDraft = (rec?: TnaRecord): RowDraft => {
  if (!rec) return BLANK;
  const g = minutesToGrace(rec.graceMinutes);
  return { start: isoToLocalInput(rec.plannedStart), end: isoToLocalInput(rec.plannedEnd), graceValue: rec.graceMinutes > 0 ? String(g.value) : "", graceUnit: rec.graceMinutes > 0 ? g.unit : "days", notes: rec.notes ?? "" };
};
const graceMin = (d: RowDraft) => graceToMinutes(Number(d.graceValue) || 0, d.graceUnit);
/** A comparable fingerprint - 1 day and 24 hours of grace are the same thing. */
const fingerprint = (d: RowDraft) => `${d.start}|${d.end}|${graceMin(d)}|${d.notes.trim()}`;
const isBlank = (d: RowDraft) => !d.start && !d.end;

function rowError(d: RowDraft): string | null {
  if (isBlank(d)) return null;
  if (!d.start || !d.end) return "Give both a start and an end - or clear this stage.";
  const s = new Date(d.start).getTime();
  const e = new Date(d.end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return "That date and time isn't valid.";
  if (e <= s) return "The end must be after the start.";
  if (d.graceValue !== "" && (Number(d.graceValue) < 0 || Number.isNaN(Number(d.graceValue)))) return "Grace time can't be negative.";
  return null;
}

/** A local "yyyy-MM-ddTHH:mm" for a Date. */
const toLocal = (d: Date) => isoToLocalInput(d.toISOString());

/**
 * One order's stages, each with a start, an end and optional grace time.
 *
 * Everything typed here is a DRAFT until "Save TNA": nothing reaches the
 * database before that, the save is one all-or-nothing request, and "Discard"
 * puts the saved schedule back. Stages left empty simply have no TNA - the
 * order's workflow does not depend on any of this.
 */
export function StageScheduleEditor({ order, allRecords, onDirtyChange }: { order: OrderListRow; allRecords: TnaRecord[]; onDirtyChange: (dirty: boolean) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow(30_000);
  const { data, isLoading } = useOrderTna(order.id);
  const save = useSaveOrderTna();
  const stages = useMemo(() => [...(order.stagePlan ?? [])].sort((a, b) => a.seq - b.seq), [order.stagePlan]);
  const records = useMemo(() => data?.records ?? [], [data]);
  const recBySection = useMemo(() => new Map(records.map((r) => [r.sectionId, r])), [records]);

  const baseline = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, toDraft(recBySection.get(s.id))])) as Record<string, RowDraft>, [stages, recBySection]);
  // null until the first edit: the rows are then simply what is saved. (Deriving them, rather
  // than copying the saved values into state, means a save or a discard just sets this back to null.)
  const [draft, setDraft] = useState<Record<string, RowDraft> | null>(null);
  const [noteOpen, setNoteOpen] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<null | "fill" | "grace">(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const rows = draft ?? baseline;
  const set = (id: string, patch: Partial<RowDraft>) => setDraft((prev) => ({ ...(prev ?? baseline), [id]: { ...(prev ?? baseline)[id], ...patch } }));

  const errors = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, rowError(rows[s.id] ?? BLANK)])), [stages, rows]);
  const changedIds = useMemo(() => stages.filter((s) => fingerprint(rows[s.id] ?? BLANK) !== fingerprint(baseline[s.id] ?? BLANK)).map((s) => s.id), [stages, rows, baseline]);
  const dirty = changedIds.length > 0;
  const scheduled = stages.filter((s) => !isBlank(rows[s.id] ?? BLANK)).length;
  const hasErrors = Object.values(errors).some(Boolean);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function handleSave() {
    if (!draft || hasErrors) return;
    const clearing = changedIds.filter((id) => isBlank(rows[id]) && !isBlank(baseline[id]));
    if (clearing.length > 0) {
      const ok = await confirm({
        title: `Remove the TNA from ${clearing.length} stage${clearing.length === 1 ? "" : "s"}?`,
        message: `${clearing.map((id) => stages.find((s) => s.id === id)?.label).join(", ")} will no longer have a schedule. The change stays in the history.`,
        confirmLabel: "Save and remove",
        tone: "danger",
      });
      if (!ok) return;
    }
    // Only send what changed: the rest is already as saved.
    const payload = changedIds.map((id) => {
      const d = rows[id];
      return isBlank(d) ? { sectionId: id, plannedStart: null, plannedEnd: null } : { sectionId: id, plannedStart: localInputToIso(d.start), plannedEnd: localInputToIso(d.end), graceMinutes: graceMin(d), notes: d.notes.trim() || null };
    });
    try {
      const result = await save.mutateAsync({ orderId: order.id, stages: payload });
      setDraft(null);
      toast.success(`TNA saved for IO ${order.ioNo} - ${result.records.length} stage${result.records.length === 1 ? "" : "s"} scheduled.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the TNA. Nothing was changed.");
    }
  }

  function discard() {
    setDraft(null);
  }

  // ---- bulk tools (all of them only change the draft)
  const [fillStart, setFillStart] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return toLocal(d);
  });
  const [fillOverwrite, setFillOverwrite] = useState(false);
  const [graceAll, setGraceAll] = useState<{ value: string; unit: GraceUnit }>({ value: "1", unit: "days" });

  /** Stage after stage: a stage of N days runs 9:00 on its first day to 18:00 on its last; the next begins the following morning. */
  function autoFill() {
    const startMs = new Date(fillStart).getTime();
    if (Number.isNaN(startMs)) return toast.error("Pick a valid start date and time first.");
    let cursor = new Date(startMs);
    const next = { ...rows };
    for (const s of stages) {
      const days = Math.max(s.typicalDurationDays || 1, 1);
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + days - 1);
      end.setHours(18, 0, 0, 0);
      if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + 9 * 3_600_000);
      if (isBlank(rows[s.id]) || fillOverwrite) next[s.id] = { ...rows[s.id], start: toLocal(start), end: toLocal(end) };
      cursor = new Date(end);
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(9, 0, 0, 0);
    }
    setDraft(next);
    setTool(null);
    toast.success("Dates filled in from each stage's typical duration - adjust them, then save.");
  }

  function applyGraceToAll() {
    const next = { ...rows };
    for (const s of stages) if (!isBlank(rows[s.id])) next[s.id] = { ...rows[s.id], graceValue: graceAll.value, graceUnit: graceAll.unit };
    setDraft(next);
    setTool(null);
  }

  const { id: currentOrderId, ioNo: currentIo } = order;
  const sources = useMemo(() => {
    const by = new Map<string, { order: NonNullable<TnaRecord["order"]>; records: TnaRecord[] }>();
    for (const r of allRecords) {
      if (r.orderId === currentOrderId || !r.order) continue;
      const g = by.get(r.orderId) ?? { order: r.order, records: [] };
      g.records.push(r);
      by.set(r.orderId, g);
    }
    // Same IO first - sister colours share a plan.
    return [...by.values()].sort((a, b) => Number(b.order.ioNo === currentIo) - Number(a.order.ioNo === currentIo) || a.order.ioNo.localeCompare(b.order.ioNo, undefined, { numeric: true }));
  }, [allRecords, currentOrderId, currentIo]);

  function copyFrom(sourceOrderId: string, newStart: string) {
    const src = sources.find((s) => s.order.id === sourceOrderId);
    if (!src) return;
    const firstStart = Math.min(...src.records.map((r) => new Date(r.plannedStart).getTime()));
    const target = new Date(newStart).getTime();
    const shift = Number.isNaN(target) ? 0 : target - firstStart;
    const next = { ...rows };
    let applied = 0;
    for (const s of stages) {
      const r = src.records.find((x) => x.stageKey === s.key);
      if (!r) continue;
      next[s.id] = {
        start: toLocal(new Date(new Date(r.plannedStart).getTime() + shift)),
        end: toLocal(new Date(new Date(r.plannedEnd).getTime() + shift)),
        graceValue: r.graceMinutes > 0 ? String(minutesToGrace(r.graceMinutes).value) : "",
        graceUnit: r.graceMinutes > 0 ? minutesToGrace(r.graceMinutes).unit : "days",
        notes: r.notes ?? "",
      };
      applied++;
    }
    setDraft(next);
    setCopyOpen(false);
    toast.success(applied > 0 ? `Copied ${applied} stage${applied === 1 ? "" : "s"} from IO ${src.order.ioNo} - review the dates, then save.` : "That order has no stages in common with this one.");
  }

  if (isLoading || !data) return <Loader label="Loading this order's TNA…" />;

  return (
    <AccentCard tone="emerald">
      <CardHeader
        title={<SectionTitle icon="🗓️" tone="emerald">Stages &amp; schedule</SectionTitle>}
        subtitle={`IO ${order.ioNo} · ${order.style}${order.color ? ` · ${order.color}` : ""} - give a stage a start and an end to track it. Leave a stage empty to skip it.`}
      />
      <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
            <Button variant="secondary" size="sm" onClick={() => setTool(tool === "fill" ? null : "fill")}>
              Auto-fill dates
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setTool(tool === "grace" ? null : "grace")}>
              Grace for all
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCopyOpen(true)} disabled={sources.length === 0} title={sources.length === 0 ? "No other order has a TNA to copy yet" : undefined}>
              Copy from an order…
            </Button>
            <Button variant="ghost" size="sm" className="text-status-bad" onClick={() => setDraft(Object.fromEntries(stages.map((s) => [s.id, BLANK])))} disabled={scheduled === 0}>
              Clear all
            </Button>
          </div>

      {tool === "fill" && (
        <div className="mx-6 mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-600">First stage starts</p>
            <input type="datetime-local" value={fillStart} onChange={(e) => setFillStart(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-900" />
          </div>
          <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-ink-700">
            <input type="checkbox" checked={fillOverwrite} onChange={(e) => setFillOverwrite(e.target.checked)} />
            Also replace stages that already have dates
          </label>
          <Button size="sm" onClick={autoFill}>
            Fill in sequence
          </Button>
          <p className="basis-full text-[11px] text-emerald-900">Each stage gets its typical number of days - 9:00 AM on its first day to 6:00 PM on its last - and the next stage starts the following morning. It only fills the boxes; nothing is saved until you press Save TNA.</p>
        </div>
      )}
      {tool === "grace" && (
        <div className="mx-6 mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-600">Excess / grace time</p>
            <div className="flex gap-2">
              <input type="number" min={0} step="any" value={graceAll.value} onChange={(e) => setGraceAll({ ...graceAll, value: e.target.value })} className="w-24 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium" />
              <select value={graceAll.unit} onChange={(e) => setGraceAll({ ...graceAll, unit: e.target.value as GraceUnit })} className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs font-medium">
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>
          <Button size="sm" onClick={applyGraceToAll}>
            Apply to every scheduled stage
          </Button>
        </div>
      )}

      <div className="px-3 pb-2 sm:px-6">
        <div className="hidden grid-cols-[minmax(190px,1.2fr)_minmax(165px,1fr)_minmax(165px,1fr)_150px_36px] gap-3 px-3 pb-2 text-[10px] font-bold uppercase tracking-wide text-ink-500 lg:grid">
          <span>Stage</span>
          <span>Start date &amp; time</span>
          <span>End date &amp; time</span>
          <span>Excess / grace (optional)</span>
          <span />
        </div>

        <div className="space-y-2">
          {stages.map((s) => {
            const d = rows[s.id] ?? BLANK;
            const err = errors[s.id];
            const rec = recBySection.get(s.id);
            const changed = changedIds.includes(s.id);
            const result = rec && !changed ? computeTna(rec, now) : null;
            const dur = !err && !isBlank(d) ? formatDuration((new Date(d.end).getTime() - new Date(d.start).getTime()) / 60000) : null;
            const noteShown = noteOpen.has(s.id) || d.notes !== "";
            return (
              <div key={s.id} className={`rounded-xl border px-3 py-2.5 transition-colors ${err ? "border-rose-300 bg-rose-50/60" : changed ? "border-brand/40 bg-brand/[0.04]" : isBlank(d) ? "border-white/80 bg-white/50" : "border-white/80 bg-white/80"}`}>
                <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(190px,1.2fr)_minmax(165px,1fr)_minmax(165px,1fr)_150px_36px] lg:gap-3">
                  <div className="min-w-0 lg:pt-1.5">
                    <p className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[10px] font-bold text-white">{s.seq}</span>
                      <span className="truncate text-sm font-bold text-ink-900">{s.label}</span>
                      <span className="shrink-0 rounded-full bg-white px-1.5 py-px text-[9px] font-bold text-ink-500 ring-1 ring-ink-200">{s.unitType}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-7 text-[11px] text-ink-500">
                      <span>typical {s.typicalDurationDays}d</span>
                      {result && <TnaChip result={result} />}
                      {changed && !err && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-bold text-brand">unsaved</span>}
                      {dur && <span className="font-semibold text-ink-700">planned {dur}</span>}
                    </p>
                  </div>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-500 lg:hidden">Start</span>
                    <Input type="datetime-local" value={d.start} onChange={(e) => set(s.id, { start: e.target.value })} className="!px-2.5 !py-1.5 !text-xs" />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-500 lg:hidden">End</span>
                    <Input type="datetime-local" value={d.end} min={d.start || undefined} onChange={(e) => set(s.id, { end: e.target.value })} className="!px-2.5 !py-1.5 !text-xs" />
                  </label>
                  <div>
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-500 lg:hidden">Excess / grace</span>
                    <div className="flex gap-1.5">
                      <Input type="number" min={0} step="any" placeholder="0" value={d.graceValue} onChange={(e) => set(s.id, { graceValue: e.target.value })} className="!w-[4.4rem] !px-2 !py-1.5 !text-xs" />
                      <Select value={d.graceUnit} onChange={(e) => set(s.id, { graceUnit: e.target.value as GraceUnit })} className="!px-2 !py-1.5 !text-xs">
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 lg:pt-1">
                    <button type="button" title="Clear this stage's schedule" aria-label={`Clear ${s.label}`} onClick={() => set(s.id, BLANK)} disabled={isBlank(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">
                      ✕
                    </button>
                  </div>
                </div>
                {(err || noteShown || !isBlank(d)) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-0 lg:pl-7">
                    {err && <p className="text-xs font-semibold text-status-bad">{err}</p>}
                    {!err && !isBlank(d) && !noteShown && (
                      <button type="button" onClick={() => setNoteOpen(new Set(noteOpen).add(s.id))} className="text-[11px] font-semibold text-brand hover:underline">
                        + note
                      </button>
                    )}
                    {noteShown && !isBlank(d) && <input type="text" maxLength={500} placeholder="Note (optional) - why this date?" value={d.notes} onChange={(e) => set(s.id, { notes: e.target.value })} className="min-w-[14rem] flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs" />}
                  </div>
                )}
                {rec && !changed && rec.graceMinutes > 0 && result && (
                  <p className="mt-1 pl-0 text-[11px] text-ink-500 lg:pl-7">Grace deadline {fmtDateTime(result.graceEndAt, true)}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/80 bg-white/90 px-6 py-3 backdrop-blur-none">
        <p className="text-xs text-ink-600">
          <b className="text-ink-900">{scheduled}</b> of {stages.length} stages scheduled
          {dirty && (
            <>
              {" · "}
              <b className="text-brand">{changedIds.length} unsaved change{changedIds.length === 1 ? "" : "s"}</b>
            </>
          )}
          {hasErrors && <span className="font-semibold text-status-bad"> · fix the highlighted stages to save</span>}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={discard} disabled={!dirty || save.isPending}>
            Discard changes
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || hasErrors} isLoading={save.isPending}>
            Save TNA
          </Button>
        </div>
      </div>

      <CopyModal open={copyOpen} onClose={() => setCopyOpen(false)} sources={sources} onCopy={copyFrom} />
    </AccentCard>
  );
}

function CopyModal({ open, onClose, sources, onCopy }: { open: boolean; onClose: () => void; sources: { order: NonNullable<TnaRecord["order"]>; records: TnaRecord[] }[]; onCopy: (orderId: string, start: string) => void }) {
  const [sourceId, setSourceId] = useState("");
  const [start, setStart] = useState("");
  const chosen = sources.find((s) => s.order.id === sourceId) ?? sources[0];
  const firstStart = chosen ? toLocal(new Date(Math.min(...chosen.records.map((r) => new Date(r.plannedStart).getTime())))) : "";
  return (
    <Modal open={open} onClose={onClose} title="Copy a schedule from another order" widthClass="max-w-lg">
      <div className="space-y-4">
        <Select label="Copy from" value={chosen?.order.id ?? ""} onChange={(e) => { setSourceId(e.target.value); setStart(""); }}>
          {sources.map((s) => (
            <option key={s.order.id} value={s.order.id}>
              IO {s.order.ioNo} · {s.order.style}
              {s.order.color ? ` · ${s.order.color}` : ""} - {s.records.length} stage{s.records.length === 1 ? "" : "s"}
            </option>
          ))}
        </Select>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">Start the copy at (the first stage moves here, the rest keep their spacing)</span>
          <input type="datetime-local" value={start || firstStart} onChange={(e) => setStart(e.target.value)} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium" />
        </label>
        <p className="text-xs text-ink-500">Matches stages by name, copies their start, end, grace and notes into the boxes. Nothing is saved until you press Save TNA, and Discard changes undoes it.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => chosen && onCopy(chosen.order.id, start || firstStart)} disabled={!chosen}>
            Copy into the boxes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
