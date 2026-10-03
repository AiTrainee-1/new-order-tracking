import type { UnitType } from "./types";

/**
 * Dual-unit stages: Acid Wash and CPL Wash.
 *
 * Every other stage is measured in ONE unit, and the plan validator, the
 * production chain and the gating layer all lean on that: a plan switches
 * KG -> PCS exactly once (at the size-origin stage, Cutting), and a stage
 * only inherits quantity from a neighbour counted in the same unit.
 *
 * These two stages are the exception. Garment washes are done after Cutting
 * as readily as fabric washes are done before it, and the vendor reports
 * BOTH a weight and a piece count, so each of them records a KG ledger AND a
 * size-wise PCS ledger side by side. To let them sit anywhere in a plan
 * without disturbing the one-and-only KG -> PCS handoff, they are treated as
 * UNIT-NEUTRAL by:
 *   - validateStagePlan (src/lib/stagePlan.ts) - excluded from the unit
 *     transition / size-origin placement rules, the same way a passthrough
 *     PCS stage (Accessories) already is;
 *   - the chain and gating carry-over (src/lib/chain.ts, src/lib/progress.ts)
 *     - once a wash sits on the garment side of the plan, the stage after it
 *     keeps inheriting from the last stage that was really counted in pieces,
 *     exactly as if the wash weren't there.
 *
 * Matched by frozen catalog `key`, not a schema flag: this is a deliberate,
 * two-stage exception rather than a general "any stage can be dual-unit"
 * feature, and a key already travels on every OrderStagePlan row - including
 * orders created long before this existed - so no migration or backfill is
 * needed and nothing about an existing order changes.
 */
export const DUAL_UNIT_STAGE_KEYS: readonly string[] = ["acid_wash", "cpl_wash"];

export function isDualUnitStage(stage: { key: string }): boolean {
  return DUAL_UNIT_STAGE_KEYS.includes(stage.key);
}

interface UnitSection {
  key: string;
  unitType: UnitType;
  isOrderOrigin: boolean;
  isPassthrough: boolean;
}

/** True once a piece-counted stage has come before `index` in the plan -
 *  i.e. the plan has already switched from fabric (KG) to garments (PCS).
 *  The order-origin stage (Order Confirmation) and passthrough stages
 *  (Accessories) are PCS-typed but sit outside the real KG -> PCS story, so
 *  they don't count - same exclusion validateStagePlan makes. */
export function isOnGarmentSide(sections: readonly UnitSection[], index: number): boolean {
  for (let j = 0; j < index; j++) {
    const s = sections[j];
    if (s.unitType === "PCS" && !s.isOrderOrigin && !s.isPassthrough) return true;
  }
  return false;
}

/** Index of the stage the stage at `index` inherits its quantity from.
 *  Normally that is simply the stage immediately before it; the one
 *  exception is that a dual-unit stage sitting on the garment side is
 *  skipped, so a wash dropped between Cutting and Sewing never cuts Sewing
 *  off from Cutting's output. A wash on the fabric side is NOT skipped - its
 *  KG hand-off to the next fabric stage works exactly as it always did. */
export function carrySourceIndex(sections: readonly UnitSection[], index: number): number {
  let j = index - 1;
  while (j >= 0 && isDualUnitStage(sections[j]) && isOnGarmentSide(sections, j)) j--;
  return j;
}
