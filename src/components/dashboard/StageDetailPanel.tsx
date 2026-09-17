"use client";

import { useMemo, useState } from "react";
import type { StageProgress } from "@/lib/progress";
import { buildLotJourney, type ChainStage, type ProductionChain } from "@/lib/chain";
import { buildAccessoryFlows, type AccessoryFlow } from "@/lib/accessories";
import { lotStatus } from "@/components/forms/stage/chainForms";
import { LotSummaryTable, ReworkSummaryTable, SizeSummaryTable } from "@/components/forms/stage/chainShared";
import { useAuditLog, useProductionBundle } from "@/hooks/useProductionChain";
import { stageQtyLabels } from "@/lib/stageLabels";
import { formatDisplayDate } from "@/lib/workflow";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import type { AuditLogRow, MaterialEntryType, PublicAppUser } from "@/lib/types";

/**
 * The per-section tracking view - what a click on a GameLevelPath node (or a
 * Workflow Map marker) actually shows.
 *
 * Renders from chain.ts's per-section shape - the same lot/size/ref/doc
 * fields the operator actually typed into the ledger - and shows a clean
 * empty state when nothing has happened yet, rather than a table of zeroes.
 */

export function StageDetailPanel({
  orderId,
  stage,
  chainStage,
  chain,
  nameOf,
  usersById,
  nextStage,
  nextStageAssignees,
  nextStageAssigneesLoading,
  showAssignmentInfo = true,
  matrixActivity = false,
}: {
  orderId: string | undefined;
  stage: StageProgress;
  chainStage: ChainStage | null;
  chain: ProductionChain | null;
  nameOf: (id: string) => string;
  usersById: Map<string, PublicAppUser>;
  nextStage?: StageProgress;
  nextStageAssignees?: PublicAppUser[];
  nextStageAssigneesLoading?: boolean;
  showAssignmentInfo?: boolean;
  /** Renders Section Activity as a chessboard-style matrix table (matching
   * the MD Output dashboard's Stage/Size Matrix) instead of the original
   * card-per-record timeline. Both Admin and MD's OrderDetailPage pass this;
   * default stays false so any other caller keeps the plain timeline. */
  matrixActivity?: boolean;
}) {
  // Corrections and requirement changes only exist in the audit log - for Raw
  // Material Planning it is the ONLY per-entry record, since that stage writes
  // requirements rather than ledger entries.
  const auditQuery = useAuditLog(orderId);
  const notStarted = !chainStage || (!chainStage.isStarted && stage.entries.length === 0);

  // Accessories tracks its own requirement -> entries data (see
  // AccessoryRequirement/AccessoryEntry in prisma/schema.prisma), entirely
  // separate from chain.ts's production math - so chainStage.bySize below is
  // meaningless noise for this stage (Accessories has no size axis at all,
  // it just falls back to the PO's ordered qty per size) and the real
  // accessory numbers have to come from the order bundle instead. The
  // Order Detail page that renders this panel already fetches the same
  // bundle for its chain, so this reuses the cached query rather than
  // issuing a second request.
  const isAccessoriesStage = stage.stage.formType === "accessories";
  const bundleQuery = useProductionBundle(orderId);
  const accessoryFlows = useMemo(
    () => (isAccessoriesStage ? buildAccessoryFlows(bundleQuery.data?.accessoryRequirements ?? [], bundleQuery.data?.accessoryEntries ?? []) : []),
    [isAccessoriesStage, bundleQuery.data],
  );

  const cumulativeLoss = useMemo(() => {
    if (!chain || !chainStage || chainStage.byLot.length === 0) return null;
    const lotsById = new Map(chain.lots.map((l) => [l.id, l]));
    let total = 0;
    for (const lf of chainStage.byLot) {
      const lot = lotsById.get(lf.lotId);
      if (!lot) continue;
      total += buildLotJourney(lot, chain).totalLoss;
    }
    return total;
  }, [chain, chainStage]);

  if (notStarted) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
        <p className="text-2xl">⏳</p>
        <p className="mt-2 text-sm font-semibold text-ink-700">Not Started Yet</p>
        <p className="mt-1 text-xs text-ink-400">Nothing has been recorded for this section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {chainStage && (
        <>
          <SectionSummary cs={chainStage} stage={stage} cumulativeLoss={cumulativeLoss} nameOf={nameOf} />

          {stage.stage.formType === "lot_inspection" && chainStage.byLot.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Lot Status</h4>
              <div className="flex flex-wrap gap-2">
                {chainStage.byLot.map((l) => {
                  const status = lotStatus(l);
                  return (
                    <div key={l.lotId} className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                      <span className="text-xs font-semibold text-ink-900">{l.lotNo}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {chainStage.byLot.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Lot-wise Breakdown</h4>
              <LotSummaryTable cs={chainStage} />
            </div>
          )}

          {chainStage.bySize.length > 0 && !isAccessoriesStage && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Size-wise Breakdown</h4>
              <SizeSummaryTable cs={chainStage} />
            </div>
          )}

          {isAccessoriesStage && <AccessoryPositionSection flows={accessoryFlows} />}

          {chainStage.reworkBySize.some((r) => r.added > 0 || r.solved > 0) && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Rework - {stage.stage.label}</h4>
              <ReworkSummaryTable cs={chainStage} />
            </div>
          )}

          {chainStage.material && chain && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Material Position</h4>
              <Table
                keyFor={(f) => f.requirement.id}
                rows={chain.requirementFlows}
                emptyMessage="No yarn or fabric planned for this order yet."
                columns={[
                  { header: "Material", render: (f) => f.requirement.name },
                  { header: "Type", render: (f) => <span className="capitalize">{f.requirement.category}</span> },
                  { header: "Required", render: (f) => <span className="tabular-nums">{f.totals.required.toLocaleString()}</span> },
                  { header: "Planned", render: (f) => <span className="tabular-nums">{f.plannedQty.toLocaleString()}</span> },
                  {
                    header: "Received",
                    render: (f) => <span className="font-semibold tabular-nums text-status-good">{f.receivedQty.toLocaleString()}</span>,
                  },
                  {
                    header: "Balance",
                    render: (f) => <span className={`font-semibold tabular-nums ${f.balance > 0 ? "text-amber-600" : "text-status-good"}`}>{f.balance.toLocaleString()}</span>,
                  },
                  {
                    // Derived from the actual figures rather than the
                    // requirement's own isCompleted flag - a material can be
                    // ticked complete while a balance is still outstanding, and
                    // the number is the honest answer.
                    header: "Status",
                    render: (f) => {
                      const tone = f.balance === 0 && f.receivedQty > 0 ? "good" : f.receivedQty > 0 ? "warn" : "neutral";
                      const label = f.balance === 0 && f.receivedQty > 0 ? "Full" : f.receivedQty > 0 ? "Partial" : "Pending";
                      return <Badge tone={tone}>{label}</Badge>;
                    },
                  },
                ]}
              />
            </div>
          )}
        </>
      )}

      <ActivityTimeline stage={stage} chainStage={chainStage} chain={chain} auditRows={auditQuery.data ?? []} nameOf={nameOf} matrix={matrixActivity} />

      {showAssignmentInfo && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ContactTile
            label="Responsible Person(s)"
            people={stage.responsibleUserIds.map((id) => usersById.get(id)).filter((u): u is PublicAppUser => !!u)}
            emptyLabel="Not yet actioned"
          />
          <ContactTile label="Next Assigned Person" people={nextStageAssignees ?? []} emptyLabel={nextStageAssigneesLoading ? "Loading…" : "No one assigned to the next stage yet"} />
        </div>
      )}

      {showAssignmentInfo && !stage.isCompleted && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Estimated completion: <span className="font-semibold">{formatDisplayDate(stage.estimatedCompletionDate)}</span> (based on a typical {stage.stage.typicalDurationDays}-day cycle for this
          stage)
          {nextStage ? ` · next: ${nextStage.stage.label}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * The headline numbers for a section, in the order someone actually asks
 * them: what came in, what went out, what's left, what was lost.
 *
 * The stacked bar underneath is the point of this block - it puts Output,
 * Rejected and Balance on the same scale as Input, so "did this section pass
 * its quantity through cleanly?" is answered by looking, not by subtracting
 * two numbers in your head.
 */
function SectionSummary({ cs, stage, cumulativeLoss, nameOf }: { cs: ChainStage; stage: StageProgress; cumulativeLoss: number | null; nameOf: (id: string) => string }) {
  const unit = cs.unit;
  const labels = stageQtyLabels(cs.stage.key);
  const { input, output, rejected, balance } = cs;

  // Scale against whichever is larger so an over-producing stage (output above
  // input) still renders inside the bar instead of overflowing it.
  const denom = Math.max(input, output + rejected, 1);
  const pct = (n: number) => Math.max(0, Math.min(100, (n / denom) * 100));
  const outputPct = pct(output);
  const rejectedPct = pct(rejected);
  const balancePct = Math.max(0, 100 - outputPct - rejectedPct);

  const yieldPct = input > 0 ? Math.round((output / input) * 1000) / 10 : null;

  // Variation against the previous section: what it handed over vs what this
  // one actually counted in. Only meaningful when both figures exist.
  const variation = cs.recordedIn > 0 && cs.inherited > 0 ? cs.recordedIn - cs.inherited : null;

  // While a section is open the outstanding figure is work still owed; once
  // it's closed the same number is a shortage that will never arrive.
  const closed = stage.isCompleted;

  return (
    <div className="space-y-3 rounded-2xl border border-white/70 bg-white/70 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label={labels.in} value={input} unit={unit} hint={inputHint(cs)} />
        <SummaryTile label={labels.out} value={output} unit={unit} tone="good" hint="passed to next section" />
        <SummaryTile
          label={closed ? "Shortage" : labels.balance}
          value={balance}
          unit={unit}
          tone={balance > 0 ? (closed ? "bad" : "warn") : "good"}
          hint={closed ? "never arrived" : "still owed here"}
        />
        <SummaryTile label={labels.rejected} value={rejected} unit={unit} tone={rejected > 0 ? "bad" : "neutral"} hint="removed from the flow" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wide text-ink-500">Input → Output comparison</span>
          {yieldPct !== null && <span className="font-semibold tabular-nums text-ink-700">{yieldPct}% of input moved on</span>}
        </div>

        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-ink-100" role="presentation">
          {outputPct > 0 && <div className="h-full bg-status-good" style={{ width: `${outputPct}%` }} />}
          {rejectedPct > 0 && <div className="h-full bg-status-rejected" style={{ width: `${rejectedPct}%` }} />}
          {balancePct > 0 && <div className="h-full bg-status-warn" style={{ width: `${balancePct}%` }} />}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-600">
          <BarKey className="bg-status-good" label={labels.out} value={output} unit={unit} />
          {rejected > 0 && <BarKey className="bg-status-rejected" label={labels.rejected} value={rejected} unit={unit} />}
          {balance > 0 && <BarKey className="bg-status-warn" label={closed ? "Shortage" : labels.balance} value={balance} unit={unit} />}
        </div>
      </div>

      {variation !== null && variation !== 0 && (
        <p className={`rounded-lg border px-3 py-2 text-xs ${variation < 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
          <b>Variation vs previous section:</b> {cs.inherited.toLocaleString()} {unit} was handed over, {cs.recordedIn.toLocaleString()} {unit} was counted in here -{" "}
          <b>
            {variation > 0 ? "+" : "−"}
            {Math.abs(variation).toLocaleString()} {unit}
          </b>
          {variation < 0 ? " short on arrival." : " more than expected."} Both figures are kept as recorded.
        </p>
      )}

      {cumulativeLoss !== null && cumulativeLoss > 0 && (
        <p className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-800">
          <b>Cumulative loss</b> across every lot up to this section:{" "}
          <b>
            {cumulativeLoss.toLocaleString()} {unit}
          </b>
        </p>
      )}

      <Contributors cs={cs} stage={stage} nameOf={nameOf} />
    </div>
  );
}

/** Checkerboard cell shading, matching OutputView's Stage/Size Matrix and
 *  AccessoriesTrackingView's own tables - kept as its own copy per this
 *  codebase's existing precedent (each stage-matrix-style view defines it
 *  locally rather than sharing one utility). */
function accPosCellShade(rowIdx: number, colIdx: number): string {
  return (rowIdx + colIdx) % 2 === 0 ? "bg-white" : "bg-slate-50";
}
const accPosCellBase = "border border-ink-200 px-3 py-2.5 text-sm";
const accPosCellNum = `${accPosCellBase} text-right font-mono tabular-nums`;

/** The Accessories stage's real data - Required/Purchased/Inward/Dispatched
 *  per accessory, plus every entry against it. Renders in place of the
 *  generic (and here meaningless) Size-wise Breakdown - see the module
 *  comment above `isAccessoriesStage` in StageDetailPanel. Styled as a dark-
 *  header checkerboard grid (not the plain `Table` component) so it reads
 *  clearly against the busy panel around it. */
function AccessoryPositionSection({ flows }: { flows: AccessoryFlow[] }) {
  const entries = useMemo(
    () =>
      flows
        .flatMap((f) => f.entries.map((e) => ({ entry: e, name: f.requirement.name, unit: f.requirement.unit })))
        .sort((a, b) => b.entry.entryDate.localeCompare(a.entry.entryDate) || b.entry.createdAt.localeCompare(a.entry.createdAt)),
    [flows],
  );

  return (
    <>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Accessory Position</h4>
        {flows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 bg-white/60 px-3 py-6 text-center text-sm text-ink-400">No accessories required for this order yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-200 shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                  {["Accessory", "Unit", "Required", "Purchased", "Inward", "Dispatched", "Balance", "Status"].map((h) => (
                    <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flows.map((f, rowIdx) => {
                  const balance = f.balanceToPurchase || f.balanceToInward || f.balanceToDispatch;
                  const started = f.totals.purchased + f.totals.inward + f.totals.dispatched > 0;
                  const tone = f.isComplete ? "good" : started ? "warn" : "neutral";
                  const label = f.isComplete ? "Complete" : started ? "Partial" : "Pending";
                  return (
                    <tr key={f.requirement.id}>
                      <td className={`${accPosCellBase} font-semibold text-ink-900 ${accPosCellShade(rowIdx, 0)}`}>{f.requirement.name}</td>
                      <td className={`${accPosCellBase} text-ink-500 ${accPosCellShade(rowIdx, 1)}`}>{f.requirement.unit}</td>
                      <td className={`${accPosCellNum} ${accPosCellShade(rowIdx, 2)}`}>{f.totals.required.toLocaleString()}</td>
                      <td className={`${accPosCellNum} ${accPosCellShade(rowIdx, 3)}`}>{f.totals.purchased.toLocaleString()}</td>
                      <td className={`${accPosCellNum} ${accPosCellShade(rowIdx, 4)}`}>{f.totals.inward.toLocaleString()}</td>
                      <td className={`${accPosCellNum} font-semibold text-status-good ${accPosCellShade(rowIdx, 5)}`}>{f.totals.dispatched.toLocaleString()}</td>
                      <td className={`${accPosCellNum} font-semibold ${balance > 0 ? "text-amber-600" : "text-status-good"} ${accPosCellShade(rowIdx, 6)}`}>{balance.toLocaleString()}</td>
                      <td className={`${accPosCellBase} text-right ${accPosCellShade(rowIdx, 7)}`}>
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {flows.length > 1 && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                    <td className={`${accPosCellBase} border-l-4 border-l-blue-600 text-blue-900`} colSpan={2}>
                      Total
                    </td>
                    <td className={`${accPosCellNum} text-blue-900`}>{sumByFlow(flows, (f) => f.totals.required)}</td>
                    <td className={`${accPosCellNum} text-blue-900`}>{sumByFlow(flows, (f) => f.totals.purchased)}</td>
                    <td className={`${accPosCellNum} text-blue-900`}>{sumByFlow(flows, (f) => f.totals.inward)}</td>
                    <td className={`${accPosCellNum} text-emerald-700`}>{sumByFlow(flows, (f) => f.totals.dispatched)}</td>
                    <td className={accPosCellNum} />
                    <td className={accPosCellBase} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Accessory Entries</h4>
          <div className="overflow-x-auto rounded-xl border border-ink-200 shadow-sm">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  {["Date", "Accessory", "Type", "Qty", "Vendor / Sent To", "DC Name"].map((h) => (
                    <th key={h} className="border-b-2 border-ink-200 px-3 py-2.5 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {entries.map(({ entry, name, unit }, rowIdx) => (
                  <tr key={entry.id} className={accPosCellShade(rowIdx, 0)}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-500">{formatDisplayDate(entry.entryDate)}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink-900">{name}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={entry.entryType === "dispatch" ? "good" : entry.entryType === "inward" ? "info" : "warn"}>{entry.entryType}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {entry.qty.toLocaleString()} {unit}
                    </td>
                    <td className="px-3 py-2.5 text-ink-600">{(entry.entryType === "dispatch" ? entry.sentTo : entry.vendor) ?? "-"}</td>
                    <td className="px-3 py-2.5 text-ink-600">{entry.docNo ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function sumByFlow(flows: AccessoryFlow[], pick: (f: AccessoryFlow) => number): string {
  return flows.reduce((total, f) => total + pick(f), 0).toLocaleString();
}

function inputHint(cs: ChainStage): string {
  if (cs.recordedIn > 0) return "counted in here";
  if (cs.inherited > 0) return "carried from previous";
  return "order baseline";
}

function SummaryTile({ label, value, unit, tone = "neutral", hint }: { label: string; value: number; unit: string; tone?: "good" | "bad" | "warn" | "neutral"; hint?: string }) {
  const color = tone === "good" ? "text-status-good" : tone === "bad" ? "text-status-bad" : tone === "warn" ? "text-amber-600" : "text-ink-900";
  return (
    <div className="rounded-xl border border-white/80 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-[10px] font-medium text-ink-400">{unit}</span>
      </p>
      {hint && <p className="text-[10px] leading-tight text-ink-400">{hint}</p>}
    </div>
  );
}

function BarKey({ className, label, value, unit }: { className: string; label: string; value: number; unit: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}{" "}
      <b className="tabular-nums text-ink-800">
        {value.toLocaleString()} {unit}
      </b>
    </span>
  );
}

/**
 * Who actually entered this section's figures, and how much each of them
 * accounted for - the question "who do I ask about this number?" answered
 * without scrolling the ledger.
 *
 * Prefers the production ledger, since that's where the quantities live, and
 * falls back to the gating entries for sections that don't write one (the
 * procurement and confirmation stages).
 */
function Contributors({ cs, stage, nameOf }: { cs: ChainStage; stage: StageProgress; nameOf: (id: string) => string }) {
  const people = useMemo(() => {
    const map = new Map<string, { id: string; entries: number; qty: number; last: string | null }>();

    const bump = (id: string, qty: number, date: string) => {
      const row = map.get(id) ?? { id, entries: 0, qty: 0, last: null };
      row.entries += 1;
      row.qty += qty;
      row.last = !row.last || date > row.last ? date : row.last;
      map.set(id, row);
    };

    if (cs.txns.length > 0) {
      for (const t of cs.txns) bump(t.enteredBy, t.qtyOut || t.qtyIn, t.entryDate);
    } else {
      for (const e of stage.entries) bump(e.enteredBy, e.qtyForwarded, e.entryDate);
    }

    return Array.from(map.values()).sort((a, b) => b.entries - a.entries);
  }, [cs.txns, stage.entries]);

  if (people.length === 0) return null;

  return (
    <div className="border-t border-ink-100 pt-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Entered by</p>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/80 bg-white px-2.5 py-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-bold text-white">{nameOf(p.id).charAt(0).toUpperCase()}</span>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-ink-900">{nameOf(p.id)}</p>
              <p className="text-[10px] text-ink-500">
                {p.entries} {p.entries === 1 ? "entry" : "entries"}
                {p.qty > 0 ? ` · ${p.qty.toLocaleString()} ${cs.unit}` : ""}
                {p.last ? ` · last ${formatDisplayDate(p.last)}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

function ActivityTimeline({
  stage,
  chainStage,
  chain,
  auditRows,
  nameOf,
  matrix = false,
}: {
  stage: StageProgress;
  chainStage: ChainStage | null;
  chain: ProductionChain | null;
  auditRows: AuditLogRow[];
  nameOf: (id: string) => string;
  matrix?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const events = useMemo(() => buildActivityEvents(stage, chainStage, chain, auditRows), [stage, chainStage, chain, auditRows]);

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
        <ActivityMatrixTable events={visible} nameOf={nameOf} />
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <ActivityRow key={e.id} event={e} nameOf={nameOf} />
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
function ActivityMatrixTable({ events, nameOf }: { events: ActivityEvent[]; nameOf: (id: string) => string }) {
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
            return (
              <tr key={e.id}>
                <td className={`${activityCellBase} whitespace-nowrap font-mono text-ink-700 ${activityCellShade(rowIdx, 0)}`}>{formatDisplayDate(e.date)}</td>
                <td className={`${activityCellBase} ${activityCellShade(rowIdx, 1)}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-bold text-white">{name.charAt(0).toUpperCase()}</span>
                    <span className="font-medium text-ink-900">{name}</span>
                  </div>
                </td>
                <td className={`${activityCellBase} ${activityCellShade(rowIdx, 2)}`}>
                  <Badge tone={e.tone}>{e.action}</Badge>
                </td>
                <td className={`${activityCellBase} text-ink-600 ${activityCellShade(rowIdx, 3)}`}>
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
                <td className={`${activityCellBase} font-mono tabular-nums ${activityCellShade(rowIdx, 4)}`}>
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
                <td className={`${activityCellBase} text-ink-500 ${activityCellShade(rowIdx, 5)}`}>{e.notes ? <span className="text-xs italic">&quot;{e.notes}&quot;</span> : "-"}</td>
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
function ActivityRow({ event, nameOf }: { event: ActivityEvent; nameOf: (id: string) => string }) {
  const name = nameOf(event.userId);
  return (
    <div className="rounded-xl border border-white/80 bg-white px-3 py-2.5">
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
        <div className="md:pt-0.5">
          <Badge tone={event.tone}>{event.action}</Badge>
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

function buildActivityEvents(stage: StageProgress, chainStage: ChainStage | null, chain: ProductionChain | null, auditRows: AuditLogRow[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const lotsById = new Map((chain?.lots ?? []).map((l) => [l.id, l.lotNo]));
  const labels = stageQtyLabels(stage.stage.key);

  // --- Quantity entries (Knitting → Packing) --------------------------------
  for (const t of chainStage?.txns ?? []) {
    const chips: ActivityChip[] = [];
    if (t.lotId) chips.push({ label: "Lot", value: lotsById.get(t.lotId) ?? "unknown" });
    if (t.sizeCode) chips.push({ label: "Size", value: t.sizeCode });
    if (t.refName) {
      const label = t.txnType === "send" ? "Sent to" : t.txnType === "receive" ? "Received from" : "Party";
      chips.push({ label, value: t.refName });
    }
    if (t.docNo) chips.push({ label: "Doc", value: t.docNo });
    if (t.isJobWork) chips.push({ label: "Source", value: "Job Work" });

    const metrics: ActivityMetric[] = [];
    if (t.qtyIn > 0) metrics.push({ label: labels.in, value: t.qtyIn, unit: t.unit });
    if (t.qtyOut > 0) metrics.push({ label: labels.out, value: t.qtyOut, unit: t.unit, tone: "good" });
    if (t.qtyRejected > 0) metrics.push({ label: labels.rejected, value: t.qtyRejected, unit: t.unit, tone: "bad" });
    if (t.qtyRework > 0) metrics.push({ label: labels.rework || "Rework", value: t.qtyRework, unit: t.unit, tone: "warn" });

    events.push({
      id: `txn-${t.id}`,
      userId: t.enteredBy,
      date: t.entryDate,
      sortKey: t.createdAt,
      action: t.txnType === "send" ? "Sent Out" : t.txnType === "receive" ? "Received Back" : "Recorded Entry",
      tone: t.txnType === "send" ? "external" : t.txnType === "receive" ? "good" : "info",
      chips,
      metrics,
      notes: t.notes,
    });
  }

  // --- Procurement entries (PO to Suppliers, Raw Material Inward) -----------
  const materialTypes = MATERIAL_ENTRY_STAGES[stage.stage.key];
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
        });
      }
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
    });
  }

  // --- Corrections, and Raw Material Planning's requirement history ---------
  //
  // Creates of a txn/material entry are skipped: the entry itself is already
  // in the list above, and showing both would double every row.
  for (const a of auditRows) {
    if (a.sectionId !== stage.stage.id) continue;
    const isEntryCreate = a.action === "create" && (a.entity === "production_txn" || a.entity === "material_entry");
    if (isEntryCreate) continue;

    const chips: ActivityChip[] = Object.entries(a.changes ?? {}).map(([field, c]) => ({
      label: field.replace(/_/g, " "),
      value: `${String(c.from ?? "-")} → ${String(c.to ?? "-")}`,
    }));

    events.push({
      id: `audit-${a.id}`,
      userId: a.userId,
      date: a.createdAt.slice(0, 10),
      sortKey: a.createdAt,
      action: a.action === "update" ? "Corrected" : a.action === "delete" ? "Deleted" : "Updated Plan",
      tone: a.action === "delete" ? "bad" : "warn",
      summary: a.summary,
      chips,
      metrics: [],
      notes: a.notes,
    });
  }

  return events.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

function ContactTile({ label, people, emptyLabel }: { label: string; people: PublicAppUser[]; emptyLabel: string }) {
  const unique = Array.from(new Map(people.map((p) => [p.id, p])).values());
  return (
    <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      {unique.length === 0 ? (
        <p className="mt-0.5 text-sm text-ink-400">{emptyLabel}</p>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          {unique.map((p) => (
            <div key={p.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-ink-900">{p.name}</span>
              {p.phone ? (
                <a href={`tel:${p.phone}`} className="text-xs font-medium text-brand hover:underline">
                  {p.phone}
                </a>
              ) : (
                <span className="text-xs text-ink-400">no phone on file</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
