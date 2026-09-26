"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useProductionChain } from "@/hooks/useProductionChain";
import { buildOutputSummary } from "@/lib/chain";
import { useOrderAssignments } from "@/hooks/useAssignments";
import { orderImageUrl } from "@/lib/imageUrl";
import { deliveryUrgency, formatDisplayDate, urgencyTextClasses } from "@/lib/workflow";
import { getCombinedCutQuantity } from "@/lib/orderQty";
import { orderTrackingBasePath } from "@/lib/routing";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Loader } from "@/components/ui/Loader";
import { Table } from "@/components/ui/Table";
import { WorkflowRail } from "@/components/dashboard/WorkflowRail";
import { StageDetailPanel } from "@/components/dashboard/StageDetailPanel";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { BackButton } from "@/components/ui/BackButton";
import type { PublicAppUser } from "@/lib/types";

const HISTORY_PAGE_SIZE = 15;

/**
 * Order tracking is one component reused verbatim under /admin and /md (see
 * orderTrackingBasePath) - same data, same everything, differing only in
 * which base path its internal links point back into.
 */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const basePath = orderTrackingBasePath(usePathname());
  const { order, purchaseOrders, entries, usersById, progress, isLoading, isError } = useOrderDetail(orderId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  // Collapsed by default - it's a full cross-section log and pushes everything
  // above it off the screen on a long order.
  const [showHistory, setShowHistory] = useState(false);
  const assignmentsQuery = useOrderAssignments(order?.id);

  // The quantity layer for the whole order - every PO combined, which is what
  // this page has always defaulted to. progress (below) still drives which
  // stages are open/complete; this drives what the numbers actually are, lot by
  // lot and size by size.
  const { chain } = useProductionChain({ orderId, purchaseOrders, poId: null });
  const selectedSectionId = progress?.stages[selectedIndex]?.stage.id;
  const selectedChainStage = chain?.stages.find((s) => s.stage.id === selectedSectionId) ?? null;

  /** Names for the workflow tooltips / responsible-person panels. */
  const nameOf = useMemo(() => (id: string) => usersById.get(id)?.name ?? "Unknown", [usersById]);

  const sectionLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of progress?.stages ?? []) map.set(s.stage.id, s.stage.label);
    return map;
  }, [progress]);

  if (isLoading) return <Loader full label="Loading order…" />;
  if (isError || !order || !progress) {
    return <p className="text-sm text-status-bad">Couldn&apos;t load this order.</p>;
  }

  const imageUrl = orderImageUrl(order.imageId);
  const urgency = deliveryUrgency(progress.order.deliveryDate);
  const selectedStage = progress.stages[selectedIndex];

  const plannedQty = order.totalQty;
  const fixedQty = getCombinedCutQuantity(order, purchaseOrders);
  const productionQty = chain?.totalPcs ?? plannedQty;

  // --- Order Overview KPIs ------------------------------------------------
  // Every figure below is read straight off the chain / progress objects that
  // already drive the tables further down. cutPcs/packedPcs come from the
  // same role-flag lookups (isSizeOrigin/isFinalOutput) buildOutputSummary
  // uses elsewhere, not a hardcoded catalog key.
  const outputSummary = chain ? buildOutputSummary(chain) : null;
  const yarnRequiredKg = chain?.materialTotals.yarn.required ?? 0;
  const yarnCountsPlanned = chain ? chain.requirementFlows.filter((f) => f.requirement.category === "yarn").length : 0;
  const cutPcs = outputSummary?.cutPcs ?? 0;
  const packedPcs = outputSummary?.packedPcs ?? 0;
  const notYetCut = Math.max(productionQty - cutPcs, 0);
  const cutNotPacked = Math.max(cutPcs - packedPcs, 0);

  // Who is scheduled to run the NEXT stage - from the assignment roster rather
  // than only from whoever happened to be named on the last entry.
  const nextStage = progress.stages[selectedIndex + 1];
  const nextStageAssignees = (assignmentsQuery.data ?? [])
    .filter((a) => a.sectionId === nextStage?.stage.id)
    .map((a) => usersById.get(a.userId))
    .filter((u): u is PublicAppUser => !!u);

  const history = [...entries].reverse();
  const historyTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const historyCurrentPage = Math.min(historyPage, historyTotalPages);
  const historyRows = history.slice((historyCurrentPage - 1) * HISTORY_PAGE_SIZE, historyCurrentPage * HISTORY_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to={`${basePath}/dashboard`} label="Back to Dashboard" />
        <Link href={`${basePath}/output/${order.id}`}>
          <Button size="sm">Production Output & Reports →</Button>
        </Link>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/70">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
            ) : (
              <GarmentPlaceholder className="h-10 w-10 text-ink-500" />
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-900">{order.style}</h1>
              <Badge tone="neutral">IO {order.ioNo}</Badge>
              <Badge tone="neutral">{order.color}</Badge>
              {order.buyer && <Badge tone="neutral">Buyer: {order.buyer.name}</Badge>}
              {progress.partialStagesCount > 0 && (
                <Badge tone="warn">
                  {progress.partialStagesCount} stage{progress.partialStagesCount === 1 ? "" : "s"} moved on unfinished
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-500">{order.description}</p>
            <p className="mt-1 text-xs text-ink-400">{order.fabric}</p>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              <Metric label="Buyer Order Qty (All POs)" value={plannedQty.toLocaleString() + " PCS"} />
              <Metric label="Extra %" value={`${purchaseOrders[0]?.extraPercent ?? 0}%`} />
              <Metric label="Extra Qty" value={Math.max(productionQty - plannedQty, 0).toLocaleString() + " PCS"} />
              <Metric label="Final Production Qty" value={productionQty.toLocaleString() + " PCS"} tone="text-brand" />
              <Metric label="Fixed Qty (Post-Cutting)" value={fixedQty != null ? fixedQty.toLocaleString() + " PCS" : "Not cut yet"} />
              <Metric label="Delivery" value={formatDisplayDate(progress.order.deliveryDate)} />
              <Metric
                label="Days Remaining"
                value={progress.daysRemaining !== null ? (progress.daysRemaining >= 0 ? `${progress.daysRemaining} days` : `${Math.abs(progress.daysRemaining)} days overdue`) : "No date set"}
                tone={urgencyTextClasses[urgency]}
              />
              <Metric label="Overall Progress" value={`${progress.overallProgressPct}%`} />
            </div>
            <ProgressBar value={progress.overallProgressPct} className="mt-3" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Order Overview" subtitle="Scope, then the order's journey left to right, then where it has got to overall." />
        <CardBody>
          {/* Deliberately in the order the quantity actually travels, so the
              row can be read straight across rather than jumped around:

                  scope   - what was ordered, and across how many POs
                  input   - the yarn bought to make it
                  funnel  - not yet cut → cut but unpacked → packed
                  summary - how far the whole order has got

              Which is also why the colours run neutral → indigo → amber →
              amber → green: the row visibly resolves from outstanding to
              done as the eye moves right. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
            <Kpi label="Order Count" value={productionQty.toLocaleString()} unit="PCS" hint={`buyer ${plannedQty.toLocaleString()} + extra`} tone="brand" />
            <Kpi label="Active Programs" value={purchaseOrders.length.toLocaleString()} unit={purchaseOrders.length === 1 ? "PO" : "POs"} hint="POs in this style" tone="neutral" />
            <Kpi
              label="Yarn Count"
              value={yarnRequiredKg.toLocaleString()}
              unit="KG"
              hint={yarnCountsPlanned ? `${yarnCountsPlanned} count${yarnCountsPlanned === 1 ? "" : "s"} planned` : "nothing planned yet"}
              tone="indigo"
            />
            <Kpi label="Not Yet Cut" value={notYetCut.toLocaleString()} unit="PCS" hint={cutPcs > 0 ? `${cutPcs.toLocaleString()} cut so far` : "cutting not started"} tone={notYetCut > 0 ? "warn" : "good"} />
            <Kpi label="Cut, Not Yet Packed" value={cutNotPacked.toLocaleString()} unit="PCS" hint="work in progress" tone={cutNotPacked > 0 ? "warn" : "good"} />
            <Kpi label="Packed / Ship-Ready" value={packedPcs.toLocaleString()} unit="PCS" hint={`${pctOf(packedPcs, productionQty)}% of the order`} tone="good" />
            <Kpi label="Overall Completion" value={`${progress.overallProgressPct}%`} hint={`${progress.completedStagesCount} of ${progress.stages.length} sections closed`} tone="brand" />
          </div>
        </CardBody>
      </Card>

      {/* The workflow and the section it opens sit SIDE BY SIDE. The rail stays
          put; only the right-hand pane changes when a different section is
          selected. */}
      <Card>
        <CardHeader
          title="Complete Production Workflow"
          subtitle={`${progress.completedStagesCount} completed · ${progress.pendingStagesCount} pending${
            progress.partialStagesCount ? ` · ${progress.partialStagesCount} moved on unfinished` : ""
          } · all POs combined`}
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)]">
            {/* Left: the stage list, in full. All render - no inner scroll here,
                so the rail is never truncated and its height is what sets the
                card's height. The detail pane opposite does the scrolling. */}
            <div>
              <div className="rounded-2xl border border-white/70 bg-white/60 p-2.5">
                <WorkflowRail stages={progress.stages} currentStageIndex={progress.currentStageIndex} selectedIndex={selectedIndex} onSelect={setSelectedIndex} userNameById={nameOf} />
              </div>
            </div>

            {/* Right: whatever the rail has selected. On desktop the pane is
                absolutely positioned inside its grid cell so the row is sized
                purely by the rail beside it and the pane fills exactly that. */}
            <div className="min-w-0 lg:relative lg:min-h-0">
              {selectedStage ? (
                <div className="scroll-panel rounded-2xl border border-white/70 bg-white/60 lg:absolute lg:inset-0 lg:overflow-y-auto">
                  {/* Stays put at the top of the scrolling pane - on a long
                      section you would otherwise scroll past the only label
                      saying which of the eighteen you are reading. */}
                  <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 rounded-t-2xl border-b border-ink-100 bg-white/85 px-4 py-3 backdrop-blur-sm">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        Section {selectedIndex + 1} of {progress.stages.length}
                      </p>
                      <h3 className="text-base font-bold text-ink-900">{selectedStage.stage.label}</h3>
                      <p className="text-xs text-ink-500">
                        {selectedStage.isCompleted
                          ? `Completed by ${selectedStage.completedBy ? nameOf(selectedStage.completedBy) : "-"} on ${formatDisplayDate(selectedStage.completedOn)}`
                          : selectedStage.isPartial
                            ? `Moved on without completing · last update ${formatDisplayDate(selectedStage.lastEntryDate)}`
                            : selectedStage.entries.length
                              ? `In progress · last update ${formatDisplayDate(selectedStage.lastEntryDate)}`
                              : "Not started yet"}
                      </p>
                    </div>
                    <Badge tone={selectedStage.isCompleted ? "good" : selectedStage.isPartial ? "warn" : selectedStage.entries.length ? "info" : "neutral"}>
                      {selectedStage.isCompleted ? "Completed" : selectedStage.isPartial ? "Moved on - not completed" : selectedStage.entries.length ? "In Progress" : "Pending"}
                    </Badge>
                  </div>

                  <div className="space-y-4 p-4">
                    <StageDetailPanel
                      orderId={orderId}
                      stage={selectedStage}
                      chainStage={selectedChainStage}
                      chain={chain}
                      nameOf={nameOf}
                      usersById={usersById}
                      nextStage={nextStage}
                      nextStageAssignees={nextStageAssignees}
                      nextStageAssigneesLoading={assignmentsQuery.isLoading}
                      matrixActivity
                    />
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">Pick a section on the left to see its detail here.</p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Complete Movement History" subtitle={`${entries.length} entries logged across all stages · all POs combined`} />
        <CardBody className="space-y-3">
          {!showHistory ? (
            <Button variant="secondary" size="sm" onClick={() => setShowHistory(true)}>
              See Here
            </Button>
          ) : (
            <>
              <Table
                keyFor={(e) => e.id}
                rows={historyRows}
                emptyMessage="No production activity logged for this order yet."
                columns={[
                  { header: "Date", render: (e) => formatDisplayDate(e.entryDate) },
                  { header: "Workflow Section", render: (e) => <span className="font-medium text-ink-900">{sectionLabelById.get(e.sectionId) ?? "-"}</span> },
                  { header: "By", render: (e) => nameOf(e.enteredBy) },
                  { header: "Qty Fwd", render: (e) => e.qtyForwarded.toLocaleString() },
                  { header: "Result", render: (e) => <Badge tone={e.isCompleted ? "good" : "warn"}>{e.isCompleted ? "Completed" : "Partial"}</Badge> },
                  { header: "Notes", render: (e) => e.notes || "-" },
                ]}
              />

              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <Button variant="secondary" size="sm" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyCurrentPage <= 1}>
                    ← Previous
                  </Button>
                  <span className="text-xs text-ink-500">
                    Page {historyCurrentPage} of {historyTotalPages} · showing {historyRows.length} of {history.length}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))} disabled={historyCurrentPage >= historyTotalPages}>
                    Next →
                  </Button>
                </div>
              )}

              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                Hide
              </Button>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** Share of a total, floored at 0 and guarded against a zero denominator so an
 * order with nothing entered yet reads 0% rather than NaN. */
function pctOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

const KPI_SKIN: Record<string, { rail: string; value: string; chip: string }> = {
  brand: { rail: "border-l-brand", value: "text-brand", chip: "bg-brand/10" },
  good: { rail: "border-l-status-good", value: "text-status-good", chip: "bg-status-good/10" },
  warn: { rail: "border-l-amber-500", value: "text-amber-600", chip: "bg-amber-500/10" },
  indigo: { rail: "border-l-indigo-500", value: "text-indigo-700", chip: "bg-indigo-500/10" },
  neutral: { rail: "border-l-ink-300", value: "text-ink-900", chip: "bg-ink-100" },
};

/** One Order Overview tile. Colour is a status cue, not decoration: amber means
 * a quantity is still outstanding, green means it has landed. */
function Kpi({ label, value, unit, hint, tone = "neutral" }: { label: string; value: string; unit?: string; hint?: string; tone?: keyof typeof KPI_SKIN | string }) {
  const skin = KPI_SKIN[tone] ?? KPI_SKIN.neutral;
  return (
    <div className={`rounded-xl border border-white/70 border-l-4 ${skin.rail} ${skin.chip} px-3 py-2.5`}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={`text-lg font-bold tabular-nums ${skin.value}`}>{value}</span>
        {unit && <span className="text-[11px] font-semibold text-ink-400">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-sm font-semibold ${tone ?? "text-ink-900"}`}>{value}</p>
    </div>
  );
}
