import type { StageFormType, UnitType } from "./types";

/** The catalog row shape the validator needs - a subset of StageDefinition. */
export interface StagePlanCatalogEntry {
  id: string;
  key: string;
  label: string;
  unitType: UnitType;
  formType: StageFormType;
  typicalDurationDays: number;
  noLotTracking: boolean;
  isOrderOrigin: boolean;
  isProcurement: boolean;
  procurementRank: number | null;
  canBeLotOrigin: boolean;
  canBeSizeOrigin: boolean;
  isPassthrough: boolean;
  isFinalOutput: boolean;
  isFabricCheckpoint: boolean;
  drawsMaterialBaseline: boolean;
  includeInLossRows: boolean;
  isActive: boolean;
}

export interface StagePlanChoice {
  stageDefinitionId: string;
  seq: number;
}

export interface StagePlanInput {
  stages: StagePlanChoice[];
  sizeOriginStageDefinitionId: string | null;
  lotOriginStageDefinitionId: string | null;
}

export interface ResolvedStagePlanRow extends StagePlanChoice {
  catalog: StagePlanCatalogEntry;
  isSizeOrigin: boolean;
  isLotOrigin: boolean;
}

export type StagePlanValidationResult =
  | { ok: true; rows: ResolvedStagePlanRow[] }
  | { ok: false; error: string };

/**
 * Validates a proposed per-order stage plan against the invariants the whole
 * chain/gating rewrite depends on - see "New data model" in the migration
 * plan. Framework-agnostic (no DB access): callers fetch the catalog once
 * and pass it in. Used both by the order-creation Route Handler (the source
 * of truth) and, with the same catalog fetched client-side, by the picker UI
 * for instant feedback before submitting.
 */
export function validateStagePlan(input: StagePlanInput, catalog: StagePlanCatalogEntry[]): StagePlanValidationResult {
  const { stages, sizeOriginStageDefinitionId, lotOriginStageDefinitionId } = input;

  if (stages.length === 0) {
    return { ok: false, error: "A stage plan needs at least one stage." };
  }

  const byId = new Map(catalog.map((c) => [c.id, c]));

  // --- Resolve + basic shape ------------------------------------------------
  const resolved: (StagePlanChoice & { catalog: StagePlanCatalogEntry })[] = [];
  const seenStageIds = new Set<string>();
  for (const choice of stages) {
    const def = byId.get(choice.stageDefinitionId);
    if (!def || !def.isActive) {
      return { ok: false, error: `Unknown or inactive stage: ${choice.stageDefinitionId}.` };
    }
    if (seenStageIds.has(choice.stageDefinitionId)) {
      return { ok: false, error: `Stage "${def.label}" is selected more than once.` };
    }
    seenStageIds.add(choice.stageDefinitionId);
    resolved.push({ ...choice, catalog: def });
  }
  resolved.sort((a, b) => a.seq - b.seq);

  // Invariant 1: seq is 1..N, contiguous, unique.
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i].seq !== i + 1) {
      return { ok: false, error: "Stage order must be a contiguous 1..N sequence with no gaps or repeats." };
    }
  }

  // Invariant 2: exactly one order-origin row, and it's first.
  const originRows = resolved.filter((r) => r.catalog.isOrderOrigin);
  if (originRows.length !== 1) {
    return { ok: false, error: "The plan must include exactly one order-origin stage (Order Confirmation)." };
  }
  if (resolved[0].catalog.id !== originRows[0].stageDefinitionId) {
    return { ok: false, error: "Order Confirmation must be the first stage." };
  }

  // Invariant 3: at most one unit-type transition, counted AFTER the
  // order-origin stage. Order Confirmation is always unit_type PCS by
  // definition (it's measured in pieces), so comparing it against whatever
  // follows would always register as a "transition" even on an all-KG
  // fabric-only plan - chain.ts already special-cases the origin stage
  // (isOrderOrigin forces inherited = totalPcs unconditionally, regardless
  // of sameUnit), so that boundary is exempt here too.
  const rest = resolved.slice(1);
  let transitions = 0;
  let transitionIndexInRest = -1;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i - 1].catalog.unitType !== rest[i].catalog.unitType) {
      transitions += 1;
      if (transitionIndexInRest === -1) transitionIndexInRest = i;
    }
  }
  if (transitions > 1) {
    return { ok: false, error: "A stage plan can only switch units (KG → PCS) once." };
  }

  const hasPcs = rest.some((r) => r.catalog.unitType === "PCS");

  // Invariant 4: if any PCS stage (other than the origin) is included,
  // exactly one designated, eligible size-origin stage, sitting at the one
  // allowed transition (or right after the origin, for a plan with no KG
  // stages at all - a pre-cut/buyer-supplied-fabric order, say).
  if (hasPcs) {
    if (!sizeOriginStageDefinitionId) {
      return { ok: false, error: "A plan that includes a PCS stage needs a designated size-origin stage." };
    }
    const sizeOriginRow = resolved.find((r) => r.stageDefinitionId === sizeOriginStageDefinitionId);
    if (!sizeOriginRow) {
      return { ok: false, error: "The size-origin stage must be one of the selected stages." };
    }
    if (!sizeOriginRow.catalog.canBeSizeOrigin) {
      return { ok: false, error: `"${sizeOriginRow.catalog.label}" is not eligible to be the size-origin stage.` };
    }
    const sizeOriginIndex = resolved.indexOf(sizeOriginRow);
    const expectedIndex = (transitionIndexInRest === -1 ? 0 : transitionIndexInRest) + 1;
    if (sizeOriginIndex !== expectedIndex) {
      return {
        ok: false,
        error: `The size-origin stage must be exactly where the plan switches from KG to PCS ("${resolved[expectedIndex]?.catalog.label ?? "?"}").`,
      };
    }
  } else if (sizeOriginStageDefinitionId) {
    return { ok: false, error: "A size-origin stage was set, but this plan has no PCS stages." };
  }

  // Invariant 5: at most one lot-origin row (0 allowed), only on an eligible stage.
  if (lotOriginStageDefinitionId) {
    const lotOriginRow = resolved.find((r) => r.stageDefinitionId === lotOriginStageDefinitionId);
    if (!lotOriginRow) {
      return { ok: false, error: "The lot-origin stage must be one of the selected stages." };
    }
    if (!lotOriginRow.catalog.canBeLotOrigin) {
      return { ok: false, error: `"${lotOriginRow.catalog.label}" is not eligible to raise lots.` };
    }
  }

  // Invariant 6: procurement stages, if present, must all be present and in
  // rank order (other stages may still be interleaved around them).
  const procurementRows = resolved.filter((r) => r.catalog.isProcurement);
  if (procurementRows.length > 0) {
    const requiredRanks = new Set(catalog.filter((c) => c.isProcurement).map((c) => c.procurementRank));
    const presentRanks = new Set(procurementRows.map((r) => r.catalog.procurementRank));
    if (requiredRanks.size !== presentRanks.size || ![...requiredRanks].every((r) => presentRanks.has(r))) {
      return { ok: false, error: "The procurement stages must be included together, not partially." };
    }
    const byRank = [...procurementRows].sort((a, b) => (a.catalog.procurementRank ?? 0) - (b.catalog.procurementRank ?? 0));
    const seqByRank = byRank.map((r) => resolved.indexOf(r));
    for (let i = 1; i < seqByRank.length; i++) {
      if (seqByRank[i] < seqByRank[i - 1]) {
        return { ok: false, error: "The procurement stages must stay in order: Planning, then PO to Suppliers, then Inward." };
      }
    }
  }

  const rows: ResolvedStagePlanRow[] = resolved.map((r) => ({
    stageDefinitionId: r.stageDefinitionId,
    seq: r.seq,
    catalog: r.catalog,
    isSizeOrigin: r.stageDefinitionId === sizeOriginStageDefinitionId,
    isLotOrigin: r.stageDefinitionId === lotOriginStageDefinitionId,
  }));

  return { ok: true, rows };
}
