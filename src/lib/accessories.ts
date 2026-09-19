import type { AccessoryEntry, AccessoryEntryType, AccessoryRequirement, AccessorySizeQty } from "./types";

/**
 * Accessories flow - the direct analogue of chain.ts's buildRequirementFlow,
 * just for the accessories module's own 3 entry types (purchase/inward/
 * dispatch) instead of materials' (plan/dc/receipt/inward). Kept in its own
 * file rather than folded into chain.ts per the product ask that Accessories
 * be a completely separate module - see prisma/schema.prisma's module
 * comment above AccessoryRequirement/AccessoryEntry.
 */

/** Every unit an accessory has actually been bought/tracked in - a plain
 *  string column (see AccessoryRequirement.unit's own comment), this is
 *  just what the picker offers; typing a different value is never blocked. */
export const ACCESSORY_UNITS = ["PCS", "KG", "CONE", "METERS", "NUMBERS", "GROSS", "YARD", "SET", "BUNDLES", "BACK"] as const;

/** Validates an incoming `sizeBreakdown` payload - used by both accessory
 *  API routes. Silently drops malformed rows rather than rejecting the
 *  whole request; returns null (not []) for "not size-wise" so it can be
 *  passed straight through with `?? undefined` into a Json? field, matching
 *  AuditLog.changes' own precedent for this generator's Json columns. */
export function parseSizeBreakdown(input: unknown): AccessorySizeQty[] | null {
  if (!Array.isArray(input)) return null;
  const rows = input
    .map((row): AccessorySizeQty | null => {
      if (!row || typeof row !== "object") return null;
      const sizeCode = (row as Record<string, unknown>).sizeCode;
      const quantity = Number((row as Record<string, unknown>).quantity);
      if (typeof sizeCode !== "string" || !sizeCode.trim() || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { sizeCode, quantity };
    })
    .filter((r): r is AccessorySizeQty => r !== null);
  return rows.length > 0 ? rows : null;
}

export interface AccessoryTotals {
  required: number;
  purchased: number;
  inward: number;
  dispatched: number;
}

const ZERO_TOTALS: AccessoryTotals = { required: 0, purchased: 0, inward: 0, dispatched: 0 };

export const ENTRY_FIELD: Record<AccessoryEntryType, keyof Omit<AccessoryTotals, "required">> = {
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

export interface AccessorySizeTotals {
  sizeCode: string;
  required: number;
  purchased: number;
  inward: number;
  dispatched: number;
  /** Whichever stage the accessory is currently short at, for this size -
   *  the same "active bottleneck" idea AccessoriesForm's directory balance
   *  column uses, just per size instead of for the whole accessory. */
  balance: number;
}

/** Per-size Required/Purchased/Inward/Dispatched, for an accessory that was
 *  raised size-wise - null when it wasn't (no sizeBreakdown anywhere on the
 *  requirement or its entries), so callers can render nothing rather than an
 *  all-zero table. Every entry's own sizeBreakdown is summed by entryType,
 *  independent of the aggregate `qty` totals in AccessoryFlow - a size-wise
 *  entry's sizeBreakdown values should add up to its qty, but this never
 *  re-derives one from the other.
 *
 * Size codes are taken from the requirement's own breakdown first (so every
 * required size always gets a row, even at zero), then any extra codes an
 * entry introduced that weren't part of the original requirement. */
export function buildAccessorySizeTotals(flow: AccessoryFlow): AccessorySizeTotals[] | null {
  const requirementSizes = flow.requirement.sizeBreakdown;
  const hasAnyBreakdown = !!requirementSizes || flow.entries.some((e) => e.sizeBreakdown);
  if (!hasAnyBreakdown) return null;

  const order: string[] = [];
  const rows = new Map<string, AccessorySizeTotals>();
  const rowFor = (sizeCode: string): AccessorySizeTotals => {
    let row = rows.get(sizeCode);
    if (!row) {
      row = { sizeCode, required: 0, purchased: 0, inward: 0, dispatched: 0, balance: 0 };
      rows.set(sizeCode, row);
      order.push(sizeCode);
    }
    return row;
  };

  for (const s of requirementSizes ?? []) rowFor(s.sizeCode).required += Number(s.quantity) || 0;

  for (const e of flow.entries) {
    if (!e.sizeBreakdown) continue;
    const field = ENTRY_FIELD[e.entryType];
    for (const s of e.sizeBreakdown) rowFor(s.sizeCode)[field] += Number(s.quantity) || 0;
  }

  for (const row of rows.values()) {
    row.balance = Math.max(row.required - row.purchased, 0) || Math.max(row.purchased - row.inward, 0) || Math.max(row.inward - row.dispatched, 0);
  }

  return order.map((code) => rows.get(code)!);
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

/** How far an accessory has got overall - the furthest stage it has reached,
 *  or complete once everything required has been dispatched. The dashboard's
 *  snapshot and the Accessories Management page both classify with this, so
 *  their counts always agree. */
export type AccessoryStageBucket = "pending" | "purchase" | "inward" | "complete";

export function accessoryStageBucket(flow: AccessoryFlow): AccessoryStageBucket {
  if (flow.isComplete) return "complete";
  if (flow.totals.inward > 0 || flow.totals.dispatched > 0) return "inward";
  if (flow.totals.purchased > 0) return "purchase";
  return "pending";
}

/** Furthest along to least, with the colour each stage wears everywhere it's
 *  drawn (the dashboard's snapshot, the Accessories page's bar and order-card
 *  strips): green complete, blue inward, amber purchased, grey pending. */
export const ACCESSORY_STAGE_META: { key: AccessoryStageBucket; label: string; color: string }[] = [
  { key: "complete", label: "Complete", color: "#059669" },
  { key: "inward", label: "Inward", color: "#155EEF" },
  { key: "purchase", label: "Purchased", color: "#F59E0B" },
  { key: "pending", label: "Pending", color: "#94A3B8" },
];

export interface AccessoryFleetStats {
  /** Accessory requirements tracked (one per accessory per order). */
  total: number;
  /** Distinct orders that have at least one. */
  orders: number;
  /** How many of them were raised size-wise. */
  sizeWise: number;
  byStage: Record<AccessoryStageBucket, number>;
}

/** Counts, not quantities: accessories are bought in PCS, KG, CONE, GROSS and
 *  more, so a summed quantity across them would mean nothing. */
export function buildAccessoryFleetStats(rows: (AccessoryRequirement & { order: { id: string }; entries: AccessoryEntry[] })[]): AccessoryFleetStats {
  const byStage: Record<AccessoryStageBucket, number> = { pending: 0, purchase: 0, inward: 0, complete: 0 };
  const orderIds = new Set<string>();
  let sizeWise = 0;
  for (const row of rows) {
    orderIds.add(row.order.id);
    if (row.sizeBreakdown) sizeWise++;
    byStage[accessoryStageBucket(buildAccessoryFlow(row, row.entries))]++;
  }
  return { total: rows.length, orders: orderIds.size, sizeWise, byStage };
}
