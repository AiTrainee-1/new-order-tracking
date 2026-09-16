import type { ChainSection, Order, StageEntry, TransferType } from "./types";
import { addDays, daysRemaining } from "./workflow";

/** A single branch/unit transfer recorded on a stage entry. */
export interface StageTransfer {
  type: Exclude<TransferType, "none">;
  to: string | null;
  qty: number;
  date: string;
  enteredBy: string;
  isCompleted: boolean;
}

export interface UnitBreakdown {
  unitName: string;
  isExternal: boolean;
  qtyReceived: number;
  qtyForwarded: number;
  qtyShortage: number;
  qtyRejected: number;
  qtyReturned: number;
  isCompleted: boolean;
  lastEntryDate: string | null;
  /** How many split records were logged against this unit. */
  entryCount: number;
  /** Short label of any transfer(s) recorded for this unit, e.g. "Branch → X". */
  transferLabel: string | null;
}

export interface StageProgress {
  stage: ChainSection;
  entries: StageEntry[];
  /** What the PREVIOUS stage forwarded into this one - the automatic carry-over.
   * 0 when there is no comparable predecessor (this order's first stage, or a
   * unit-type switch at the size-origin stage where KG no longer converts 1:1
   * into PCS). */
  qtyInherited: number;
  /** What was explicitly recorded as received AT this stage (max across entries,
   * since qty_received is restated rather than accumulated). */
  qtyReceived: number;
  /** The effective quantity this stage works against: what was actually counted
   * in if recorded, otherwise what the previous stage forwarded, otherwise the
   * order's baseline. This is what makes a blank middle stage stop breaking the
   * chain - downstream stages still know the real number. */
  qtyAllotted: number;
  /** True when this stage counted in a different quantity than the previous
   * stage forwarded - a discrepancy worth surfacing for verification. */
  hasQtyMismatch: boolean;
  qtyCompletedToday: number;
  qtyForwarded: number;
  qtyShortage: number;
  qtyRejected: number;
  qtyReturned: number;
  qtyPending: number;
  isCompleted: boolean;
  /** Moved forward without being finished - the "orange" state. Goods were sent
   * on so the next stage isn't blocked, but a balance is still owed here. */
  isPartial: boolean;
  /** Every earlier stage in THIS order's plan has at least forwarded something,
   * so work can start. */
  isUnlocked: boolean;
  lastEntryDate: string | null;
  firstEntryDate: string | null;
  /** Who/when marked this stage complete (null while still open). */
  completedBy: string | null;
  completedOn: string | null;
  /** Who made the most recent entry, completed or not. */
  lastActorId: string | null;
  externalEntries: StageEntry[];
  unitBreakdown: UnitBreakdown[];
  transfers: StageTransfer[];
  responsibleUserIds: string[];
  nextAssignedUserId: string | null;
  estimatedCompletionDate: string | null;
}

export type OrderStatus = "not_started" | "on_track" | "due_soon" | "delayed" | "completed";

export interface OrderProgress {
  order: Order;
  stages: StageProgress[];
  currentStageIndex: number;
  completedStagesCount: number;
  pendingStagesCount: number;
  /** Stages moved on without being finished - outstanding balances to chase. */
  partialStagesCount: number;
  overallProgressPct: number;
  daysRemaining: number | null;
  status: OrderStatus;
  /** True once any stage has logged an entry. */
  hasStarted: boolean;
}

const TRANSFER_PREFIX: Record<Exclude<TransferType, "none">, string> = {
  branch: "Branch",
  unit: "Unit",
  outside: "Outside",
  others: "Others",
};

/** Human-readable label for a single transfer, e.g. "Branch → Unit 2". */
export function formatTransfer(type: TransferType, to: string | null): string | null {
  if (type === "none") return null;
  return `${TRANSFER_PREFIX[type]}${to ? ` → ${to}` : ""}`;
}

/** Joins the distinct transfer labels across a set of entries, or null if none. */
function summarizeTransfers(entries: StageEntry[]): string | null {
  const labels = new Set<string>();
  for (const e of entries) {
    const label = formatTransfer(e.transferType, e.transferTo);
    if (label) labels.add(label);
  }
  return labels.size ? Array.from(labels).join(", ") : null;
}

/** The last-resort baseline for a stage measured in this unit, before anything
 * has been counted in or inherited. PCS stages fall back to the fixed cut
 * quantity (or the planned total before the size-origin stage); KG has no
 * such figure, so it must come from the chain. */
export interface QtyBaseline {
  totalQty: number;
  cutQuantity: number | null;
}

function baselineFor(scope: QtyBaseline, stage: ChainSection): number {
  return stage.unitType === "PCS" ? scope.cutQuantity ?? scope.totalQty : 0;
}

/**
 * Aggregates the raw StageEntry log for one order into a per-stage and
 * overall progress model. This is the single source of truth for "how far
 * has this order progressed" - computed here (not cached in the DB) so the
 * math stays easy to inspect/adjust in one place.
 *
 * `sections` is this order's own chosen + ordered stage plan (already sorted
 * by `seq`) - see the module comment at the top of chain.ts for why "the
 * previous comparable stage" is still simply positional (`index - 1`) once
 * the array is scoped to one order.
 *
 * Conventions:
 * - qty_received is the quantity counted in at the stage, restated (not
 *   additive) on every entry - so we take the max across entries, not the sum.
 * - qty_forwarded/rejected/returned accumulate across entries (a stage can be
 *   forwarded in several split batches), so we sum them.
 * - Quantity CARRIES OVER: a stage that recorded nothing still inherits what
 *   the previous stage forwarded, so leaving one form blank never blanks out
 *   the stages after it.
 * - A stage completes ONLY when an entry explicitly marks isCompleted. An
 *   entry that forwards without completing leaves the stage "partial" - the
 *   next stage unlocks, but a balance is still owed here.
 * - Balance is derived from the running totals (allotted − forwarded −
 *   rejected), never summed from per-entry qtyShortage (which would
 *   double-count across balance entries).
 */
export function buildOrderProgress(
  order: Order,
  sections: ChainSection[],
  entries: StageEntry[],
  /** Overrides the fallback baseline - pass a PO's own { quantity, cutQuantity }
   * when `entries` has already been filtered to that PO, so a PO-scoped view
   * doesn't fall back to the whole order's numbers. Defaults to the order's own
   * totalQty/cutQuantity, unchanged from before this param existed. */
  qtyBaseline: QtyBaseline = { totalQty: order.totalQty, cutQuantity: order.cutQuantity },
): OrderProgress {
  const sortedStages = [...sections].sort((a, b) => a.seq - b.seq);

  const stageProgressList: StageProgress[] = [];

  sortedStages.forEach((stage, index) => {
    const stageEntries = entries
      .filter((e) => e.sectionId === stage.id)
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

    const qtyReceived = stageEntries.reduce((max, e) => Math.max(max, e.qtyReceived), 0);
    const qtyCompletedToday = stageEntries.reduce((sum, e) => sum + e.qtyCompletedToday, 0);
    const qtyForwarded = stageEntries.reduce((sum, e) => sum + e.qtyForwarded, 0);
    const qtyRejected = stageEntries.reduce((sum, e) => sum + e.qtyRejected, 0);
    const qtyReturned = stageEntries.reduce((sum, e) => sum + e.qtyReturned, 0);

    // Complete only when an entry explicitly says so - no auto-complete.
    //
    // Partial is likewise an explicit decision, not something inferred from the
    // numbers. Quantity is the wrong signal: a stage can legitimately be handed
    // on before anything has been counted at it - Raw Material Planning forwards
    // a plan long before a kilo of yarn arrives - and the stage after it still
    // has to unlock. The `qtyForwarded > 0` arm is a fallback for rows written
    // before isForwarded existed.
    const isCompleted = stageEntries.some((e) => e.isCompleted);
    const isPartial = !isCompleted && stageEntries.some((e) => e.isForwarded || e.qtyForwarded > 0);

    // --- Carry-over -------------------------------------------------------
    // Only inherit across stages measured in the same unit; the size-origin
    // stage switches KG → PCS, where the previous stage's number means
    // something different.
    const prev = stageProgressList[index - 1];
    const prevStage = sortedStages[index - 1];
    const sameUnit = prevStage ? prevStage.unitType === stage.unitType : false;
    const qtyInherited = prev && sameUnit ? prev.qtyForwarded : 0;

    const qtyAllotted = qtyReceived > 0 ? qtyReceived : qtyInherited > 0 ? qtyInherited : baselineFor(qtyBaseline, stage);
    const hasQtyMismatch = qtyReceived > 0 && qtyInherited > 0 && qtyReceived !== qtyInherited;

    // Derived balance (never the sum of per-entry shortage). Pending while the
    // stage is open; once completed, the un-forwarded remainder is the shortage.
    const outstanding = Math.max(qtyAllotted - qtyForwarded - qtyRejected, 0);
    const qtyPending = isCompleted ? 0 : outstanding;
    const qtyShortage = isCompleted ? outstanding : 0;

    const lastEntry = stageEntries.length ? stageEntries[stageEntries.length - 1] : null;
    const lastEntryDate = lastEntry?.entryDate ?? null;
    const firstEntryDate = stageEntries.length ? stageEntries[0].entryDate : null;

    const completingEntry = stageEntries.find((e) => e.isCompleted) ?? null;
    const completedBy = completingEntry?.enteredBy ?? null;
    const completedOn = completingEntry?.entryDate ?? null;
    const lastActorId = lastEntry?.enteredBy ?? null;

    const externalEntries = stageEntries.filter((e) => e.isExternal || e.isSentOutside);

    const unitGroups = new Map<string, StageEntry[]>();
    for (const e of stageEntries) {
      const key = e.transferTo || e.unitName || e.externalUnitName || "In-house";
      unitGroups.set(key, [...(unitGroups.get(key) ?? []), e]);
    }
    const unitBreakdown: UnitBreakdown[] = Array.from(unitGroups.entries()).map(
      ([unitName, group]) => {
        const groupReceived = group.reduce((max, e) => Math.max(max, e.qtyReceived), 0);
        const groupForwarded = group.reduce((sum, e) => sum + e.qtyForwarded, 0);
        const groupRejected = group.reduce((sum, e) => sum + e.qtyRejected, 0);
        const groupCompleted = group.some((e) => e.isCompleted);
        const groupOutstanding = Math.max(groupReceived - groupForwarded - groupRejected, 0);
        return {
          unitName,
          isExternal: group.some((e) => e.isExternal || e.transferType === "outside"),
          qtyReceived: groupReceived,
          qtyForwarded: groupForwarded,
          qtyShortage: groupCompleted ? groupOutstanding : 0,
          qtyRejected: groupRejected,
          qtyReturned: group.reduce((sum, e) => sum + e.qtyReturned, 0),
          isCompleted: groupCompleted,
          lastEntryDate: group.length ? group[group.length - 1].entryDate : null,
          entryCount: group.length,
          transferLabel: summarizeTransfers(group),
        };
      },
    );

    const transfers: StageTransfer[] = stageEntries
      .filter((e) => e.transferType !== "none")
      .map((e) => ({
        type: e.transferType as StageTransfer["type"],
        to: e.transferTo,
        qty: e.qtyForwarded,
        date: e.entryDate,
        enteredBy: e.enteredBy,
        isCompleted: e.isCompleted,
      }));

    const responsibleUserIds = Array.from(new Set(stageEntries.map((e) => e.enteredBy)));

    const lastEntryWithForward = [...stageEntries].reverse().find((e) => e.forwardedToUserId);
    const nextAssignedUserId = lastEntryWithForward?.forwardedToUserId ?? null;

    const estimatedCompletionDate = lastEntryDate
      ? addDays(lastEntryDate, stage.typicalDurationDays)
      : null;

    // Work can start here once every earlier stage in THIS order's plan has
    // at least moved goods on (completed OR partially forwarded). The first
    // stage is always open (guaranteed to be the order-origin stage - see
    // the order-creation validation rules).
    const isUnlocked =
      index === 0 || stageProgressList.every((s) => s.isCompleted || s.isPartial);

    stageProgressList.push({
      stage,
      entries: stageEntries,
      qtyInherited,
      qtyReceived,
      qtyAllotted,
      hasQtyMismatch,
      qtyCompletedToday,
      qtyForwarded,
      qtyShortage,
      qtyRejected,
      qtyReturned,
      qtyPending,
      isCompleted,
      isPartial,
      isUnlocked,
      lastEntryDate,
      firstEntryDate,
      completedBy,
      completedOn,
      lastActorId,
      externalEntries,
      unitBreakdown,
      transfers,
      responsibleUserIds,
      nextAssignedUserId,
      estimatedCompletionDate,
    });
  });

  const completedStagesCount = stageProgressList.filter((s) => s.isCompleted).length;
  const pendingStagesCount = stageProgressList.length - completedStagesCount;
  const partialStagesCount = stageProgressList.filter((s) => s.isPartial).length;

  let currentStageIndex = stageProgressList.findIndex((s) => !s.isCompleted);
  if (currentStageIndex === -1) currentStageIndex = stageProgressList.length - 1;

  const overallProgressPct = Math.round(
    (completedStagesCount / stageProgressList.length) * 100,
  );

  const remaining = daysRemaining(order.deliveryDate);
  const hasStarted = stageProgressList.some((s) => s.entries.length > 0);

  let status: OrderStatus;
  if (completedStagesCount === stageProgressList.length) {
    status = "completed";
  } else if (!hasStarted) {
    status = "not_started";
  } else if (remaining !== null && remaining < 0) {
    status = "delayed";
  } else if (remaining !== null && remaining <= 7) {
    status = "due_soon";
  } else {
    status = "on_track";
  }

  return {
    order,
    stages: stageProgressList,
    currentStageIndex,
    completedStagesCount,
    pendingStagesCount,
    partialStagesCount,
    overallProgressPct,
    daysRemaining: remaining,
    status,
    hasStarted,
  };
}

export interface FleetStats {
  totalOrders: number;
  onTrack: number;
  dueSoon: number;
  delayed: number;
  completed: number;
  totalCompletedStages: number;
  totalPendingStages: number;
}

export function buildFleetStats(all: OrderProgress[]): FleetStats {
  return all.reduce<FleetStats>(
    (acc, p) => {
      acc.totalOrders += 1;
      if (p.status === "on_track" || p.status === "not_started") acc.onTrack += 1;
      if (p.status === "due_soon") acc.dueSoon += 1;
      if (p.status === "delayed") acc.delayed += 1;
      if (p.status === "completed") acc.completed += 1;
      acc.totalCompletedStages += p.completedStagesCount;
      acc.totalPendingStages += p.pendingStagesCount;
      return acc;
    },
    {
      totalOrders: 0,
      onTrack: 0,
      dueSoon: 0,
      delayed: 0,
      completed: 0,
      totalCompletedStages: 0,
      totalPendingStages: 0,
    },
  );
}
