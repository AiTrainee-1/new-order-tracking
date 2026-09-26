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

  // Invariant 3: at most one genuine KG -> PCS handoff, counted AFTER the
  // order-origin stage and ignoring passthrough PCS stages (e.g.
  // Accessories - see prisma/schema.prisma's module comment above
  // AccessoryRequirement). Only a KG -> PCS change counts as a "switch": a
  // PCS -> KG change (Order Confirmation into the material chain, or a
  // passthrough PCS stage like Accessories sitting before it) is the normal
  // shape of every plan and must not count, and chain.ts already
  // special-cases the origin stage itself (isOrderOrigin forces
  // inherited = totalPcs unconditionally, regardless of sameUnit). A
  // passthrough PCS stage carries no cut/size dependency of its own (it
  // never reads cs.bySize/byLotSize - see AccessoriesForm.tsx), so it can
  // sit anywhere in the plan - before, inside, or after the KG block -
  // without disturbing where the one real handoff happens.
  const rest = resolved.filter((r) => !r.catalog.isOrderOrigin && !(r.catalog.unitType === "PCS" && r.catalog.isPassthrough));
  let transitions = 0;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i - 1].catalog.unitType === "KG" && rest[i].catalog.unitType === "PCS") {
      transitions += 1;
    }
  }
  if (transitions > 1) {
    return { ok: false, error: "A stage plan can only switch units (KG → PCS) once." };
  }

  // Invariant 4: a size-origin stage is OPTIONAL. chain.ts falls back to the
  // PO's own size quantities for every PCS stage when no stage originates the
  // size axis, so a plan like Order Confirmation -> Sewing -> Packing is
  // perfectly usable. When a size-origin stage IS in the plan (Cutting), it
  // still has to be eligible and sit exactly where KG becomes PCS.
  let effectiveSizeOriginId = sizeOriginStageDefinitionId;
  if (!effectiveSizeOriginId) {
    // Nobody chose one - if exactly one eligible stage is in the plan, that
    // is unambiguously the one, so callers (API clients, templates) needn't
    // spell it out.
    const candidates = resolved.filter((r) => r.catalog.canBeSizeOrigin);
    if (candidates.length === 1) effectiveSizeOriginId = candidates[0].stageDefinitionId;
  }
  if (effectiveSizeOriginId) {
    const sizeOriginRow = resolved.find((r) => r.stageDefinitionId === effectiveSizeOriginId);
    if (!sizeOriginRow) {
      return { ok: false, error: "The size-origin stage must be one of the selected stages." };
    }
    if (!sizeOriginRow.catalog.canBeSizeOrigin) {
      return { ok: false, error: `"${sizeOriginRow.catalog.label}" is not eligible to be the size-origin stage.` };
    }
    const restIndex = rest.findIndex((r) => r.stageDefinitionId === effectiveSizeOriginId);
    const anyPcsBefore = rest.slice(0, restIndex).some((r) => r.catalog.unitType === "PCS");
    const anyKgAfter = rest.slice(restIndex + 1).some((r) => r.catalog.unitType === "KG");
    if (anyPcsBefore || anyKgAfter) {
      return {
        ok: false,
        error: `"${sizeOriginRow.catalog.label}" must come after all the fabric (KG) stages and before the other garment (PCS) stages.`,
      };
    }
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
    isSizeOrigin: r.stageDefinitionId === effectiveSizeOriginId,
    isLotOrigin: r.stageDefinitionId === lotOriginStageDefinitionId,
  }));

  return { ok: true, rows };
}

/** The order the catalog's stages naturally run in on the floor - the same
 *  sequence prisma/seed.ts inserts them in (and the "Standard - All Stages"
 *  template uses). The API returns the catalog alphabetically, so the picker
 *  needs this to put a newly ticked stage where it belongs instead of at the
 *  end of the list in click order, which is what made almost every partial
 *  plan (Sewing ticked before Cutting, a fabric wash ticked after Sewing...)
 *  fail validation. */
export const CANONICAL_STAGE_KEYS = [
  "order_confirmation",
  "raw_material_planning",
  "po_to_suppliers",
  "raw_material_inward",
  "knitting",
  "dyeing",
  "brushing",
  "compacting",
  "acid_wash",
  "heat_setting",
  "washing",
  "cpl_wash",
  "lubricant_wash",
  "fabric_inhouse",
  "fabric_inspection",
  "fabric_store",
  "pattern_marker",
  "cutting",
  "bit_cutting",
  "panel_checking",
  "embroidery",
  "garment_die",
  "printing",
  "stone",
  "sewing",
  "checking",
  "ironing",
  "packing",
  "accessories",
];

export function canonicalRank(key: string): number {
  const i = CANONICAL_STAGE_KEYS.indexOf(key);
  return i === -1 ? CANONICAL_STAGE_KEYS.length : i;
}

/** Puts `id` into an ordered list of selected stage ids at its natural
 *  position: just before the first already-selected stage that normally runs
 *  after it (or at the end). Leaves whatever manual ordering the user has
 *  already done to the other stages untouched. */
export function insertStageCanonically(selectedIds: string[], id: string, catalog: StagePlanCatalogEntry[]): string[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const rank = canonicalRank(byId.get(id)?.key ?? "");
  let at = selectedIds.length;
  for (let i = 0; i < selectedIds.length; i++) {
    const other = byId.get(selectedIds[i]);
    if (other && !other.isOrderOrigin && canonicalRank(other.key) > rank) {
      at = i;
      break;
    }
  }
  return [...selectedIds.slice(0, at), id, ...selectedIds.slice(at)];
}
