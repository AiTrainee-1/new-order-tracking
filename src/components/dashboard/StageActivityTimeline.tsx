"use client";

import { useMemo, useState } from "react";
import type { StageProgress } from "@/lib/progress";
import type { ChainStage, ProductionChain } from "@/lib/chain";
import type { ProductionBundle } from "@/hooks/useProductionChain";
import { GroupEntryChip } from "@/components/groups/GroupEntryChip";
import { stageQtyLabels } from "@/lib/stageLabels";
import { isBitCuttingStage } from "@/lib/dualUnit";
import { formatDisplayDate } from "@/lib/workflow";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AuditLogRow, MaterialEntryType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Section activity - every action taken here, by whom, with what data
// ---------------------------------------------------------------------------

/**
 * A section's record is spread across four tables, by design, and no single
 * one of them answers "who did what here":
 *
 *   production_txns   the quantity entries for Knitting → Packing
 *   material_entries  the same, for the two procurement stages that have them
 *   stage_entries     the workflow actions - Save Plan, Move Forward, Complete
 *   audit_log         corrections, and the ONLY record Raw Material Planning
 *                     writes at all (it stores requirements, not entries)
 *
 * This merges all four into one chronological list so Admin and MD can read a
 * section top to bottom and see exactly what happened, in order, without
 * knowing anything about where the app happens to store it.
 */

type ActivityTone = "good" | "warn" | "bad" | "info" | "neutral" | "external" | "brand";

interface ActivityChip {
  label: string;
  value: string;
}

interface ActivityMetric {
  label: string;
  value: number;
  unit: string;
  tone?: "good" | "bad" | "warn";
}

interface ActivityEvent {
  id: string;
  userId: string;
  date: string;
  sortKey: string;
  action: string;
  tone: ActivityTone;
  summary?: string;
  chips: ActivityChip[];
  metrics: ActivityMetric[];
  notes: string | null;
  /** Set when the record was saved through an Order Group - drives the violet
   *  "Group Entry" marker. */
  groupId?: string | null;
}

/** Which material entry types belong to which procurement stage, keyed by the
 * frozen catalog `key` (see chain.ts's module comment on cosmetic key
 * lookups). Raw Material Planning is absent deliberately - it writes
 * requirements, not entries, so its history comes from the audit log instead. */
const MATERIAL_ENTRY_STAGES: Record<string, MaterialEntryType[]> = {
  po_to_suppliers: ["dc"],
  raw_material_inward: ["inward", "receipt"],
};

const INITIAL_VISIBLE = 12;

export function ActivityTimeline({
  stage,
  chainStage,
  chain,
  bundle,
  auditRows,
  nameOf,
  groupNames,
  matrix = false,
}: {
  stage: StageProgress;
  chainStage: ChainStage | null;
  chain: ProductionChain | null;
  bundle: ProductionBundle | undefined;
  auditRows: AuditLogRow[];
  nameOf: (id: string) => string;
  groupNames: Map<string, string>;
  matrix?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const events = useMemo(() => buildActivityEvents(stage, chainStage, chain, auditRows, bundle), [stage, chainStage, chain, auditRows, bundle]);

  if (events.length === 0) return null;

  const visible = expanded ? events : events.slice(0, INITIAL_VISIBLE);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Section Activity</h4>
        <span className="text-xs text-ink-500">
          {events.length} {events.length === 1 ? "record" : "records"} · newest first
        </span>
      </div>

      {matrix ? (
        <ActivityMatrixTable events={visible} nameOf={nameOf} groupNames={groupNames} />
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <ActivityRow key={e.id} event={e} nameOf={nameOf} groupNames={groupNames} />
          ))}
        </div>
      )}

      {events.length > INITIAL_VISIBLE && (
        <div className="pt-2">
          <Button variant="secondary" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show all ${events.length} records`}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Checkerboard cell shading - alternates by row AND column, matching the
 * MD Output dashboard's Stage Matrix / Size Matrix tables. */
function activityCellShade(rowIdx: number, colIdx: number): string {
  return (rowIdx + colIdx) % 2 === 0 ? "bg-white" : "bg-slate-50";
}

const activityCellBase = "border border-ink-200 px-3 py-2 align-top text-sm";

/**
 * MD-only alternative to the ActivityRow timeline: the same events, in the
 * same chessboard-grid format as Stage Matrix / Size Matrix on the MD Output
 * dashboard - one row per record, fixed columns, so the section's whole
 * history reads as a dense table instead of a stack of cards.
 */
function ActivityMatrixTable({ events, nameOf, groupNames }: { events: ActivityEvent[]; nameOf: (id: string) => string; groupNames: Map<string, string> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
            {["Date", "By", "Action", "Details", "Quantity", "Notes"].map((h) => (
              <th key={h} className="border border-ink-800 px-3 py-2.5 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e, rowIdx) => {
            const name = nameOf(e.userId);
            const grouped = !!e.groupId;
            // A group entry is tinted violet instead of the checkerboard, with a
            // violet bar down its left edge, so it reads differently at a glance.
            const shade = (col: number) => (grouped ? "bg-violet-50" : activityCellShade(rowIdx, col));
            return (
              <tr key={e.id}>
                <td className={`${activityCellBase} whitespace-nowrap font-mono text-ink-700 ${shade(0)} ${grouped ? "border-l-4 border-l-violet-500" : ""}`}>{formatDisplayDate(e.date)}</td>
                <td className={`${activityCellBase} ${shade(1)}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-bold text-white">{name.charAt(0).toUpperCase()}</span>
                    <span className="font-medium text-ink-900">{name}</span>
                  </div>
                </td>
                <td className={`${activityCellBase} ${shade(2)}`}>
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={e.tone}>{e.action}</Badge>
                    {grouped && <GroupEntryChip groupName={e.groupId ? groupNames.get(e.groupId) : null} />}
                  </div>
                </td>
                <td className={`${activityCellBase} text-ink-600 ${shade(3)}`}>
                  {e.chips.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {e.chips.map((c) => (
                        <span key={`${c.label}-${c.value}`} className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px]">
                          <span className="text-ink-400">{c.label}:</span> <b>{c.value}</b>
                        </span>
                      ))}
                    </div>
                  ) : e.summary ? (
                    <span className="text-xs">{e.summary}</span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className={`${activityCellBase} font-mono tabular-nums ${shade(4)}`}>
                  {e.metrics.length > 0 ? (
                    <div className="space-y-0.5">
                      {e.metrics.map((m) => (
                        <div key={m.label} className={m.tone === "good" ? "text-status-good" : m.tone === "bad" ? "text-status-bad" : m.tone === "warn" ? "text-amber-600" : "text-ink-900"}>
                          {m.label}: <b>{m.value.toLocaleString()}</b> {m.unit}
                        </div>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className={`${activityCellBase} text-ink-500 ${shade(5)}`}>{e.notes ? <span className="text-xs italic">&quot;{e.notes}&quot;</span> : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One activity record, laid out as three fixed columns on desktop - who, what
 * action, and the detail - so the same kind of information sits at the same
 * horizontal position on every row and the list scans down cleanly instead of
 * each card being its own ragged block. Below `md` it collapses to the natural
 * stacked order.
 */
function ActivityRow({ event, nameOf, groupNames }: { event: ActivityEvent; nameOf: (id: string) => string; groupNames: Map<string, string> }) {
  const name = nameOf(event.userId);
  const grouped = !!event.groupId;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${grouped ? "border-violet-200 border-l-4 border-l-violet-500 bg-violet-50/70" : "border-white/80 bg-white"}`}>
      <div className="flex flex-col gap-2 md:grid md:grid-cols-[12.5rem_9.5rem_minmax(0,1fr)] md:items-start md:gap-4">
        {/* Who, and when */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">{name.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-ink-900">{name}</p>
            <p className="text-[11px] text-ink-400">{formatDisplayDate(event.date)}</p>
          </div>
        </div>

        {/* What action */}
        <div className="flex flex-wrap items-start gap-1.5 md:flex-col md:pt-0.5">
          <Badge tone={event.tone}>{event.action}</Badge>
          {grouped && <GroupEntryChip groupName={event.groupId ? groupNames.get(event.groupId) : null} />}
        </div>

        {/* What was entered */}
        <div className="min-w-0 space-y-1.5 md:pt-0.5">
          {event.summary && <p className="text-xs leading-snug text-ink-600">{event.summary}</p>}

          {event.chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {event.chips.map((c) => (
                <span key={`${c.label}-${c.value}`} className="rounded-md bg-ink-50 px-2 py-0.5 text-[11px] text-ink-700">
                  <span className="text-ink-400">{c.label}:</span> <b>{c.value}</b>
                </span>
              ))}
            </div>
          )}

          {event.metrics.length > 0 && (
            // Fixed-width metric cells so In / Out / Rejected line up vertically
            // between rows rather than shifting with each value's length.
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {event.metrics.map((m) => (
                <span key={m.label} className="min-w-[8.5rem] text-ink-500">
                  {m.label} <b className={`tabular-nums ${m.tone === "good" ? "text-status-good" : m.tone === "bad" ? "text-status-bad" : m.tone === "warn" ? "text-amber-600" : "text-ink-900"}`}>
                    {m.value.toLocaleString()} {m.unit}
                  </b>
                </span>
              ))}
            </div>
          )}

          {event.notes && <p className="text-[11px] italic leading-snug text-ink-500">&ldquo;{event.notes}&rdquo;</p>}
        </div>
      </div>
    </div>
  );
}

function buildActivityEvents(stage: StageProgress, chainStage: ChainStage | null, chain: ProductionChain | null, auditRows: AuditLogRow[], bundle: ProductionBundle | undefined): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const lotsById = new Map((chain?.lots ?? []).map((l) => [l.id, l.lotNo]));
  const labels = stageQtyLabels(stage.stage.key);
  const key = stage.stage.key;

  // --- Quantity entries (Knitting → Packing) --------------------------------
  // A dual-unit stage (Acid Wash / CPL Wash) keeps its PCS rows on chainStage.pcs
  // - both halves belong in the one timeline.
  for (const t of [...(chainStage?.txns ?? []), ...(chainStage?.pcs?.txns ?? [])]) {
    const chips: ActivityChip[] = [];
    if (t.lotId) chips.push({ label: "Lot", value: lotsById.get(t.lotId) ?? "unknown" });
    if (t.sizeCode) chips.push({ label: "Size", value: t.sizeCode });
    if (t.refName) {
      const label = t.txnType === "send" ? "Sent to" : t.txnType === "receive" ? "Received from" : "Party";
      chips.push({ label, value: t.refName });
    }
    if (t.dcName) chips.push({ label: "DC Name", value: t.dcName });
    if (t.docNo) chips.push({ label: isBitCuttingStage(stage.stage) && t.unit === "KG" ? "DC Number" : "Doc", value: t.docNo });
    if (t.isJobWork) chips.push({ label: "Source", value: "Job Work" });

    const metrics: ActivityMetric[] = [];
    if (t.qtyIn > 0) metrics.push({ label: labels.in, value: t.qtyIn, unit: t.unit });
    if (t.qtyOut > 0) metrics.push({ label: labels.out, value: t.qtyOut, unit: t.unit, tone: "good" });
    if (t.qtyRejected > 0) metrics.push({ label: labels.rejected, value: t.qtyRejected, unit: t.unit, tone: "bad" });
    if (t.qtyRework > 0) metrics.push({ label: labels.rework || "Rework", value: t.qtyRework, unit: t.unit, tone: "warn" });
    if (t.qtyCount > 0) metrics.push({ label: "Bit Count", value: t.qtyCount, unit: "Nos" });

    // A row that only rejects pieces is a rejection, not "an entry".
    const rejectionOnly = t.qtyRejected > 0 && t.qtyIn === 0 && t.qtyOut === 0 && t.txnType === "process";

    events.push({
      id: `txn-${t.id}`,
      userId: t.enteredBy,
      date: t.entryDate,
      sortKey: t.createdAt,
      action: t.txnType === "send" ? "Sent Out" : t.txnType === "receive" ? "Received Back" : rejectionOnly ? "Rejected" : "Recorded Entry",
      tone: t.txnType === "send" ? "external" : t.txnType === "receive" ? "good" : rejectionOnly ? "bad" : "info",
      chips,
      metrics,
      notes: t.notes,
      groupId: t.groupId ?? null,
    });
  }

  // --- Rework (sent to rework / solved) ---------------------------------------
  // Kept out of `txns` so it can never inflate a quantity, but it is something
  // someone did and it belongs in the history.
  for (const t of [...(chainStage?.reworkTxns ?? []), ...(chainStage?.pcs?.reworkTxns ?? [])]) {
    const chips: ActivityChip[] = [];
    if (t.sizeCode) chips.push({ label: "Size", value: t.sizeCode });
    if (t.refName) chips.push({ label: "Party", value: t.refName });
    if (t.docNo) chips.push({ label: "Doc", value: t.docNo });
    const metrics: ActivityMetric[] = [];
    if (t.qtyIn > 0) metrics.push({ label: "Sent to rework", value: t.qtyIn, unit: t.unit, tone: "warn" });
    if (t.qtyOut > 0) metrics.push({ label: "Solved", value: t.qtyOut, unit: t.unit, tone: "good" });
    events.push({
      id: `rework-${t.id}`,
      userId: t.enteredBy,
      date: t.entryDate,
      sortKey: t.createdAt,
      action: t.qtyIn > 0 && t.qtyOut > 0 ? "Rework Update" : t.qtyOut > 0 ? "Rework Solved" : "Sent to Rework",
      tone: "warn",
      chips,
      metrics,
      notes: t.notes,
      groupId: t.groupId ?? null,
    });
  }

  // --- Raw Material Planning: the requirements it wrote -----------------------
  if (key === "raw_material_planning" && chain) {
    for (const flow of chain.requirementFlows) {
      const r = flow.requirement;
      const chips: ActivityChip[] = [
        { label: "Material", value: r.name },
        { label: "Type", value: r.category },
      ];
      if (r.supplier) chips.push({ label: "Supplier", value: r.supplier });
      events.push({
        id: `req-${r.id}`,
        userId: r.createdBy ?? "",
        date: r.createdAt.slice(0, 10),
        sortKey: r.createdAt,
        action: "Requirement Added",
        tone: "info",
        chips,
        metrics: [{ label: "Required", value: Number(r.requiredQty) || 0, unit: r.unit }],
        notes: r.notes,
        groupId: r.groupId ?? null,
      });
    }
  }

  // --- Procurement entries (PO to Suppliers, Raw Material Inward) -----------
  const materialTypes = MATERIAL_ENTRY_STAGES[key];
  if (materialTypes && chain) {
    for (const flow of chain.requirementFlows) {
      for (const e of flow.entries) {
        if (!materialTypes.includes(e.entryType)) continue;
        const chips: ActivityChip[] = [{ label: "Material", value: flow.requirement.name }];
        if (e.supplier) chips.push({ label: "Supplier", value: e.supplier });
        if (e.docNo) chips.push({ label: "Doc", value: e.docNo });
        if (e.lotRef) chips.push({ label: "Lot ref", value: e.lotRef });

        events.push({
          id: `mat-${e.id}`,
          userId: e.enteredBy,
          date: e.entryDate,
          sortKey: e.createdAt,
          action: e.entryType === "dc" ? "Planned Quantity" : "Received Into Store",
          tone: e.entryType === "dc" ? "info" : "good",
          chips,
          metrics: [
            {
              label: e.entryType === "dc" ? "Planned" : "Received",
              value: Number(e.qty) || 0,
              unit: flow.requirement.unit,
              tone: e.entryType === "dc" ? undefined : "good",
            },
          ],
          notes: e.notes,
          groupId: e.groupId ?? null,
        });
      }
    }
  }

  // --- Accessories: the accessories raised, and every purchase / inward / dispatch ---
  if (stage.stage.formType === "accessories" && bundle) {
    const byId = new Map(bundle.accessoryRequirements.map((r) => [r.id, r]));
    for (const r of bundle.accessoryRequirements) {
      events.push({
        id: `acc-req-${r.id}`,
        userId: r.createdBy ?? "",
        date: r.createdAt.slice(0, 10),
        sortKey: r.createdAt,
        action: "Accessory Added",
        tone: "info",
        chips: [{ label: "Accessory", value: r.name }],
        metrics: [{ label: "Required", value: Number(r.requiredQty) || 0, unit: r.unit }],
        notes: r.notes,
        groupId: r.groupId ?? null,
      });
    }
    for (const e of bundle.accessoryEntries) {
      const req = byId.get(e.requirementId);
      const chips: ActivityChip[] = [{ label: "Accessory", value: req?.name ?? "unknown" }];
      if (e.vendor) chips.push({ label: "Vendor", value: e.vendor });
      if (e.sentTo) chips.push({ label: "Sent to", value: e.sentTo });
      if (e.docNo) chips.push({ label: "Doc", value: e.docNo });
      const action = e.entryType === "purchase" ? "Purchased" : e.entryType === "inward" ? "Received Inward" : "Dispatched";
      events.push({
        id: `acc-entry-${e.id}`,
        userId: e.enteredBy,
        date: e.entryDate,
        sortKey: e.createdAt,
        action,
        tone: e.entryType === "inward" ? "good" : e.entryType === "dispatch" ? "external" : "info",
        chips,
        metrics: [{ label: action, value: Number(e.qty) || 0, unit: req?.unit ?? "" }],
        notes: e.notes,
        groupId: e.groupId ?? null,
      });
    }
  }

  // --- Workflow actions -----------------------------------------------------
  for (const e of stage.entries) {
    const action = e.isCompleted ? "Completed Section" : e.isForwarded ? "Moved Forward" : "Saved Plan";
    const tone: ActivityTone = e.isCompleted ? "good" : e.isForwarded ? "warn" : "neutral";

    const chips: ActivityChip[] = [];
    if (e.transferTo) chips.push({ label: "Transferred to", value: e.transferTo });
    if (e.unitName) chips.push({ label: "Unit", value: e.unitName });
    if (e.branch) chips.push({ label: "Branch", value: e.branch });
    if (e.isSentOutside) chips.push({ label: "Movement", value: "Sent outside" });

    const metrics: ActivityMetric[] = [];
    if (e.qtyForwarded > 0) metrics.push({ label: "Forwarded", value: e.qtyForwarded, unit: e.unitType, tone: "good" });
    if (e.qtyRejected > 0) metrics.push({ label: "Rejected", value: e.qtyRejected, unit: e.unitType, tone: "bad" });
    if (e.qtyReturned > 0) metrics.push({ label: "Returned", value: e.qtyReturned, unit: e.unitType });

    events.push({
      id: `entry-${e.id}`,
      userId: e.enteredBy,
      date: e.entryDate,
      sortKey: e.createdAt,
      action,
      tone,
      summary: e.isCompleted ? "Closed this section - nothing further expected here." : e.isForwarded ? "Released the next section to start; this one stays open." : "Recorded progress without moving anything on.",
      chips,
      metrics,
      notes: e.notes,
      groupId: e.groupId ?? null,
    });
  }

  // --- Corrections, and Raw Material Planning's requirement history ---------
  //
  // Creates of anything that now has an event of its own above are skipped:
  // showing both would double every row.
  const groupOfRow = new Map<string, string>();
  const note = (id: string, g: string | null | undefined) => {
    if (g) groupOfRow.set(id, g);
  };
  for (const t of [...(chainStage?.txns ?? []), ...(chainStage?.reworkTxns ?? []), ...(chainStage?.pcs?.txns ?? []), ...(chainStage?.pcs?.reworkTxns ?? [])]) note(t.id, t.groupId);
  for (const r of chain?.requirementFlows ?? []) {
    note(r.requirement.id, r.requirement.groupId);
    for (const e of r.entries) note(e.id, e.groupId);
  }
  for (const r of bundle?.accessoryRequirements ?? []) note(r.id, r.groupId);
  for (const e of bundle?.accessoryEntries ?? []) note(e.id, e.groupId);

  const OWN_EVENT_ENTITIES = new Set(["production_txn", "material_entry", "material_requirement", "accessory_requirement", "accessory_entry", "stage_entry"]);
  for (const a of auditRows) {
    if (a.sectionId !== stage.stage.id) continue;
    if (a.action === "create" && OWN_EVENT_ENTITIES.has(a.entity)) continue;

    const chips: ActivityChip[] = Object.entries(a.changes ?? {}).map(([field, c]) => ({
      label: field.replace(/_/g, " "),
      value: `${String(c.from ?? "-")} → ${String(c.to ?? "-")}`,
    }));

    // A correction written by a group (the server prefixes its summary) or made
    // to a row that was itself saved through a group.
    const writtenByGroup = a.summary.startsWith(GROUP_SUMMARY_PREFIX);

    events.push({
      id: `audit-${a.id}`,
      userId: a.userId,
      date: a.createdAt.slice(0, 10),
      sortKey: a.createdAt,
      action: a.action === "update" ? "Corrected" : a.action === "delete" ? "Deleted" : "Updated Plan",
      tone: a.action === "delete" ? "bad" : "warn",
      summary: writtenByGroup ? a.summary.slice(GROUP_SUMMARY_PREFIX.length) : a.summary,
      chips,
      metrics: [],
      notes: a.notes,
      groupId: (a.entityId ? groupOfRow.get(a.entityId) : null) ?? (writtenByGroup ? GROUP_UNKNOWN : null),
    });
  }

  return events.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/** What the server puts in front of an audit summary it writes for a group. */
const GROUP_SUMMARY_PREFIX = "[Group] ";
/** A group entry whose group isn't known to the page (it has been dissolved). */
const GROUP_UNKNOWN = "group";
