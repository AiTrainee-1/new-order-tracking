import type { AccessoryEntry, AccessoryEntryType, AccessoryRequirement } from "./types";

/**
 * Accessories flow - the direct analogue of chain.ts's buildRequirementFlow,
 * just for the accessories module's own 3 entry types (purchase/inward/
 * dispatch) instead of materials' (plan/dc/receipt/inward). Kept in its own
 * file rather than folded into chain.ts per the product ask that Accessories
 * be a completely separate module - see prisma/schema.prisma's module
 * comment above AccessoryRequirement/AccessoryEntry.
 */

export interface AccessoryTotals {
  required: number;
  purchased: number;
  inward: number;
  dispatched: number;
}

const ZERO_TOTALS: AccessoryTotals = { required: 0, purchased: 0, inward: 0, dispatched: 0 };

const ENTRY_FIELD: Record<AccessoryEntryType, keyof Omit<AccessoryTotals, "required">> = {
  purchase: "purchased",
  inward: "inward",
  dispatch: "dispatched",
};

export interface AccessoryFlow {
  requirement: AccessoryRequirement;
  entries: AccessoryEntry[];
  totals: AccessoryTotals;
  /** Required - purchased. Positive = still to be purchased. */
  balanceToPurchase: number;
  /** Purchased - inward. Positive = still owed by the vendor. */
  balanceToInward: number;
  /** Inward - dispatched. Positive = still sitting in store. */
  balanceToDispatch: number;
  /** True once dispatched >= required - the accessory's full journey is done. */
  isComplete: boolean;
}

export function buildAccessoryFlow(
  requirement: AccessoryRequirement,
  allEntries: AccessoryEntry[],
): AccessoryFlow {
  const entries = allEntries
    .filter((e) => e.requirementId === requirement.id)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));

  const totals: AccessoryTotals = { ...ZERO_TOTALS, required: requirement.requiredQty };
  for (const e of entries) totals[ENTRY_FIELD[e.entryType]] += Number(e.qty) || 0;

  const balanceToPurchase = Math.max(totals.required - totals.purchased, 0);
  const balanceToInward = Math.max(totals.purchased - totals.inward, 0);
  const balanceToDispatch = Math.max(totals.inward - totals.dispatched, 0);

  return {
    requirement,
    entries,
    totals,
    balanceToPurchase,
    balanceToInward,
    balanceToDispatch,
    isComplete: totals.dispatched >= totals.required && totals.required > 0,
  };
}

export function buildAccessoryFlows(
  requirements: AccessoryRequirement[],
  entries: AccessoryEntry[],
): AccessoryFlow[] {
  return requirements
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((r) => buildAccessoryFlow(r, entries));
}

export type AccessoryStageStatus = "pending" | "partial" | "complete";

/** Which of the 4 stages an accessory is currently sitting at, and whether
 *  that stage is done, in progress, or hasn't started - the classification
 *  the Accessories Stage Matrix renders per row/column. */
export function accessoryStageStatus(flow: AccessoryFlow, stage: "purchase" | "inward" | "dispatch"): AccessoryStageStatus {
  const { totals } = flow;
  if (stage === "purchase") {
    if (totals.purchased <= 0) return "pending";
    return totals.purchased >= totals.required ? "complete" : "partial";
  }
  if (stage === "inward") {
    if (totals.inward <= 0) return "pending";
    return totals.inward >= totals.purchased && totals.purchased > 0 ? "complete" : "partial";
  }
  if (totals.dispatched <= 0) return "pending";
  return totals.dispatched >= totals.inward && totals.inward > 0 ? "complete" : "partial";
}
