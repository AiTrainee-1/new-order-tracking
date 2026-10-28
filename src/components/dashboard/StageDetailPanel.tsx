"use client";

import { useMemo } from "react";
import type { StageProgress } from "@/lib/progress";
import { buildLotJourney, type ChainStage, type ProductionChain } from "@/lib/chain";
import { buildAccessoryFlows } from "@/lib/accessories";
import { lotStatus } from "@/components/forms/stage/chainForms";
import { LotSummaryTable, QuantityPosition, ReworkSummaryTable, SizeSummaryTable } from "@/components/forms/stage/chainShared";
import { useAuditLog, useProductionBundle } from "@/hooks/useProductionChain";
import { useOrderGroups } from "@/hooks/useOrderGroups";
import { groupForStage } from "@/lib/orderGroups";
import { GroupTotalsCard } from "@/components/groups/GroupTotalsCard";
import { useNow, useOrderTna } from "@/hooks/useTna";
import { TnaStageCard } from "@/components/tna/TnaStageCard";
import { stageQtyLabels } from "@/lib/stageLabels";
import { isBitCuttingStage } from "@/lib/dualUnit";
import { formatDisplayDate } from "@/lib/workflow";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import type { PublicAppUser } from "@/lib/types";
import { AccessoryPositionSection, BitCountSummary, ContactTile, SectionSummary, SummaryTile } from "./StageDetailSections";
import { ActivityTimeline } from "./StageActivityTimeline";

/**
 * The per-section tracking view - what a click on a GameLevelPath node (or a
 * Workflow Map marker) actually shows.
 *
 * Renders from chain.ts's per-section shape - the same lot/size/ref/doc
 * fields the operator actually typed into the ledger - and shows a clean
 * empty state when nothing has happened yet, rather than a table of zeroes.
 */

/** The garment stages whose entry form carries a Rejection (PCS) column. */
const QUANTITY_POSITION_STAGES = new Set(["panel_checking", "sewing", "checking", "ironing", "packing"]);

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
  // Names for the "Group Entry" marker - a record saved through an Order Group
  // says which group it came through.
  const { data: allGroups } = useOrderGroups();
  const groupNames = useMemo(() => new Map((allGroups ?? []).map((g) => [g.id, g.name])), [allGroups]);
  const groupForStageHere = orderId ? groupForStage(allGroups, orderId, stage.stage.key) : null;
  // TNA for this stage, if it has a schedule: shown even for a stage nobody has started,
  // because "overdue and untouched" is exactly when it matters.
  const tnaQuery = useOrderTna(orderId);
  const tnaNow = useNow(30_000);
  const tnaRecord = tnaQuery.data?.records.find((r) => r.sectionId === stage.stage.id) ?? null;
  const tnaCard = tnaRecord ? <TnaStageCard key={tnaRecord.id} record={tnaRecord} events={tnaQuery.data?.events ?? []} now={tnaNow} nameOf={nameOf} collapsible /> : null;

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

  // Accessories keeps its data in its own tables, so a stage can have accessories
  // recorded (written there by a group, say) and still no ledger row or stage
  // entry of its own - that is not "not started".
  const hasAccessoryData = isAccessoriesStage && (bundleQuery.data?.accessoryRequirements.length ?? 0) > 0;
  const notStarted = !hasAccessoryData && (!chainStage || (!chainStage.isStarted && stage.entries.length === 0));

  if (notStarted) {
    return (
      <div className="space-y-5">
        {tnaCard}
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm font-semibold text-ink-700">Not Started Yet</p>
          <p className="mt-1 text-xs text-ink-400">Nothing has been recorded for this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {tnaCard}
      {chainStage && (
        <>
          <SectionSummary cs={chainStage} stage={stage} cumulativeLoss={cumulativeLoss} nameOf={nameOf} />

          {QUANTITY_POSITION_STAGES.has(stage.stage.key) && chain && orderId && <QuantityPosition orderId={orderId} cs={chainStage} sizes={chain.sizes} />}

          {isBitCuttingStage(chainStage.stage) && <BitCountSummary cs={chainStage} />}

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

          {/* Acid Wash / CPL Wash only: the stage's size-wise PCS half, kept apart
              from the KG figures above (a piece count and a weight never add up). */}
          {chainStage.pcs && chainStage.pcs.isStarted && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Pieces (PCS), size-wise</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile label={stageQtyLabels(chainStage.stage.key).in} value={chainStage.pcs.recordedIn} unit="PCS" />
                <SummaryTile label={stageQtyLabels(chainStage.stage.key).out} value={chainStage.pcs.output} unit="PCS" tone="good" />
                <SummaryTile label={stageQtyLabels(chainStage.stage.key).rejected} value={chainStage.pcs.rejected} unit="PCS" tone={chainStage.pcs.rejected > 0 ? "bad" : "neutral"} />
                <SummaryTile
                  label={stageQtyLabels(chainStage.stage.key).balance}
                  value={Math.max(chainStage.pcs.recordedIn - chainStage.pcs.output, 0)}
                  unit="PCS"
                  tone={chainStage.pcs.recordedIn - chainStage.pcs.output > 0 ? "warn" : "good"}
                />
              </div>
              <SizeSummaryTable cs={chainStage.pcs} />
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

      {groupForStageHere && orderId && <GroupTotalsCard groupId={groupForStageHere.id} stageKey={stage.stage.key} currentOrderId={orderId} />}

      <ActivityTimeline stage={stage} chainStage={chainStage} chain={chain} bundle={bundleQuery.data} auditRows={auditQuery.data ?? []} nameOf={nameOf} groupNames={groupNames} matrix={matrixActivity} />

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
