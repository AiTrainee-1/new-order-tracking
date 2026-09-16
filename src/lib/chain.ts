import type {
  ChainSection,
  MaterialEntry,
  MaterialEntryType,
  MaterialRequirement,
  ProductionLot,
  ProductionTxn,
  UnitType,
} from "./types";

/**
 * The production chain.
 *
 * One calculation, run once per (order, PO), that turns the raw ledgers into
 * every number the app shows: what each stage received, what it sent on, what
 * it lost, and what it still owes - broken down by lot and by size.
 *
 * The rule the whole system rests on is:
 *
 *     a stage's input = the previous comparable stage's output
 *
 * unless that stage physically counted something different in, in which case
 * what was counted wins and the difference is surfaced rather than hidden.
 *
 * `sections` is one order's own chosen + ordered stage plan (OrderStagePlan
 * rows, already sorted by `seq`) - NOT a global fixed list any more. "The
 * previous comparable stage" is still simply `sections[index - 1]`, because
 * this array is already scoped to one order; what changed from the old
 * global-`workflow_stages` design is that every stage's STRUCTURAL role
 * (is this the order's origin? does it draw the material baseline? is it
 * where lots/sizes originate? is it a no-lot stage?) is now a boolean flag
 * frozen onto each row at order-creation time, instead of a hardcoded
 * `stage.key === "some_literal"` check - see ChainSection in ./types and the
 * OrderStagePlan model comment in prisma/schema.prisma for the full
 * rationale. A handful of purely COSMETIC cross-references (e.g. the Output
 * screen's "sewn" milestone column) still look a specific stage up by its
 * frozen catalog `key`, exactly like the old app did, because there is no
 * structural role to hang a flag on - they degrade gracefully to "not shown"
 * if an order's plan doesn't happen to include that stage.
 *
 * Two things deliberately do NOT live here:
 *   - whether a stage is open/partial/complete - that is StageEntry rows and
 *     src/lib/progress.ts, the gating layer.
 *   - who did what and when - that is the audit log.
 */

// ---------------------------------------------------------------------------
// Material totals
// ---------------------------------------------------------------------------

export interface MaterialTotals {
  /** Required Plan - what Raw Material Planning says the order needs. */
  required: number;
  /** Unused by the current three-stage flow; kept only so old "plan" rows
   * (written before Planning was simplified to a single required_qty field)
   * still total correctly instead of vanishing. */
  planned: number;
  /** Purchase Quantity - what Purchase Order to Suppliers raised against the
   * requirement. (Field name kept as `dc` for schema/type stability; the
   * stage no longer distinguishes a separate "received by buyer" step.) */
  dc: number;
  /** Unused by the current three-stage flow, for the same reason as `planned`. */
  received: number;
  /** Inward Confirmation - what Raw Material Inward actually took into store
   * against the purchase quantity. */
  inward: number;
}

const ZERO_TOTALS: MaterialTotals = { required: 0, planned: 0, dc: 0, received: 0, inward: 0 };

const ENTRY_FIELD: Record<MaterialEntryType, keyof Omit<MaterialTotals, "required">> = {
  plan: "planned",
  dc: "dc",
  receipt: "received",
  inward: "inward",
};

export interface RequirementFlow {
  requirement: MaterialRequirement;
  entries: MaterialEntry[];
  totals: MaterialTotals;
  /** What Purchase Order to Suppliers raised against the requirement. */
  plannedQty: number;
  /**
   * What was actually RECEIVED into store.
   *
   * "Inward" and "Received" are the same physical event in the current flow,
   * recorded as entry_type 'inward'; 'receipt' is a legacy type from the older
   * four-step procurement chain that nothing writes any more. Both are folded
   * in here so a screen asking "how much came in?" gets the true figure rather
   * than reading one bucket and finding it empty.
   */
  receivedQty: number;
  /** Planned - received. Positive = still owed by the supplier. */
  balance: number;
  /** Required - planned. Positive = still to be purchased. */
  toPurchase: number;
}

export function buildRequirementFlow(
  requirement: MaterialRequirement,
  allEntries: MaterialEntry[],
): RequirementFlow {
  const entries = allEntries
    .filter((e) => e.requirementId === requirement.id)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));

  const totals: MaterialTotals = { ...ZERO_TOTALS, required: requirement.requiredQty };
  for (const e of entries) totals[ENTRY_FIELD[e.entryType]] += Number(e.qty) || 0;

  const plannedQty = totals.dc;
  const receivedQty = totals.inward + totals.received;

  return {
    requirement,
    entries,
    totals,
    plannedQty,
    receivedQty,
    balance: Math.max(plannedQty - receivedQty, 0),
    toPurchase: Math.max(totals.required - plannedQty, 0),
  };
}

function sumMaterialTotals(flows: RequirementFlow[]): MaterialTotals {
  return flows.reduce<MaterialTotals>(
    (acc, f) => ({
      required: acc.required + f.totals.required,
      planned: acc.planned + f.totals.planned,
      dc: acc.dc + f.totals.dc,
      received: acc.received + f.totals.received,
      inward: acc.inward + f.totals.inward,
    }),
    { ...ZERO_TOTALS },
  );
}

// ---------------------------------------------------------------------------
// Per-stage flow
// ---------------------------------------------------------------------------

export interface LotFlow {
  lotId: string;
  lotNo: string;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  qtyRework: number;
  /** in - out - rejected, floored at 0. */
  balance: number;
  /**
   * What the previous comparable stage passed on for THIS lot - its qty_out.
   *
   * This is the KG-side equivalent of LotSizeCell.available, and it is what
   * makes the lot's quantity travel with its number without anyone re-typing
   * it. 0 across a unit-type boundary, where kilograms stop converting into
   * pieces.
   */
  available: number;
  /**
   * How much of what this stage was handed it has not accounted for yet.
   *
   * "Accounted for" is qty_in where the stage records an intake, and qty_out
   * where it doesn't (a stage with no intake step records its approved
   * quantity as its account of the lot).
   *
   * A lot can move in several batches, so this shrinks with each one rather
   * than showing the whole lot every time.
   */
  remainingAvailable: number;
  lastEntryDate: string | null;
  entryCount: number;
}

export interface SizeFlow {
  sizeCode: string;
  /** The PO's ordered quantity for this size - the yardstick every PCS stage
   * is measured against. */
  poQty: number;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  balance: number;
  /** What the size-origin stage actually cut for this size, summed across
   * every lot - the fixed reference figure, same idea as LotSizeCell.cutQty.
   * Distinct from poQty: cutting can come in under or over the ordered
   * quantity (wastage, the extra % margin), so this is the honest "what was
   * really cut" figure, not what was asked for. */
  cutQty: number;
}

export type CellStatus = "not_started" | "in_progress" | "complete";

/**
 * One (lot, size) cell at one stage - the grain the garment floor actually
 * works in from the size-origin stage onwards.
 *
 * This exists because byLot and bySize are each a projection that loses the
 * other axis, and the question every stage after the size origin has to
 * answer is about both at once: "for THIS lot in THIS size, how many did the
 * size-origin stage make, how many did the stage before me hand over, and
 * how many are left?"
 */
export interface LotSizeCell {
  lotId: string;
  lotNo: string;
  sizeCode: string;
  /** What the size-origin stage produced for this cell - the fixed reference
   * every later stage measures against, and the number that stops each one
   * inventing its own size quantity. */
  cutQty: number;
  /** What the previous PCS stage sent on for this cell; the cutQty at the
   * size-origin stage itself. This is the ceiling a new entry is validated
   * against. */
  available: number;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  qtyRework: number;
  /**
   * available - out - rejected. Rework is deliberately NOT subtracted: it is
   * work still owed at this stage, not a loss, and it becomes output once the
   * pieces are repaired. Subtracting it here would write it off; adding it to
   * output would count the same pieces twice when they are.
   */
  balance: number;
  status: CellStatus;
}

function cellKey(lotId: string, sizeCode: string): string {
  return `${lotId}::${sizeCode}`;
}

/**
 * A side ledger, per size, of pieces sent to rework at a stage and pieces
 * brought back out of it - entirely separate from the input/output/balance
 * chain above. It never feeds `available`, `balance` or any downstream
 * stage's ceiling; it only answers "how many are still sitting in rework
 * right now, at THIS stage, for THIS size."
 *
 * Recorded as ordinary production_txns rows tagged txn_type: "rework" (qty_in
 * = added, qty_out = solved), which is why the main loop filters them out of
 * `stageTxns` before computing recordedIn/output/byLot/bySize.
 */
export interface ReworkSizeFlow {
  sizeCode: string;
  /** Cumulative pieces ever sent to rework, at this stage, for this size. */
  added: number;
  /** Cumulative pieces ever brought back out of rework. */
  solved: number;
  /** added - solved, floored at 0. */
  pending: number;
}

export interface ChainStage {
  stage: ChainSection;
  unit: UnitType;
  /** What the previous comparable stage sent on. 0 across a unit switch. */
  inherited: number;
  /** What was explicitly counted in here (sum of qty_in). */
  recordedIn: number;
  /** The figure this stage actually works against: counted if recorded,
   * otherwise inherited, otherwise the stage's own baseline. */
  input: number;
  /** Sum of qty_out - what moved on to the next stage. */
  output: number;
  rejected: number;
  rework: number;
  /** input - output - rejected, floored at 0. Work still owed while the stage
   * is open; process loss once it closes. */
  balance: number;
  /** True when this stage counted in something different from what the previous
   * stage sent - a discrepancy to reconcile, never silently overwritten. */
  hasMismatch: boolean;
  /** Whether anything at all has been recorded here. */
  isStarted: boolean;
  txns: ProductionTxn[];
  byLot: LotFlow[];
  bySize: SizeFlow[];
  /** Per (lot, size), for PCS stages. Empty for KG stages and for any
   * no-lot-tracking stage, which have no size axis until the size-origin
   * stage creates one. */
  byLotSize: LotSizeCell[];
  /** The rework side ledger, per size - see ReworkSizeFlow. Computed for
   * every PCS stage the same way bySize is, but stays all-zero for any stage
   * nobody has ever recorded a rework row against. */
  reworkBySize: ReworkSizeFlow[];
  /** Populated for procurement stages only. */
  material: MaterialTotals | null;
  lastEntryDate: string | null;
}

export interface ChainInput {
  /** This order's own stage plan, already sorted by `seq`. */
  sections: ChainSection[];
  txns: ProductionTxn[];
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  /** Ordered PCS baseline - the PO's total, or the order's when unscoped. */
  totalPcs: number;
  /** Ordered quantity per size, in display order. */
  sizes: { sizeCode: string; quantity: number }[];
}

export interface ProductionChain {
  stages: ChainStage[];
  /** Keyed by the frozen catalog `key` of each section - for the handful of
   * purely cosmetic cross-references (see module comment) that have no
   * structural role flag to hang off instead. */
  byKey: Map<string, ChainStage>;
  requirementFlows: RequirementFlow[];
  materialTotals: { yarn: MaterialTotals; fabric: MaterialTotals; all: MaterialTotals };
  totalPcs: number;
  sizes: { sizeCode: string; quantity: number }[];
  lots: ProductionLot[];
}

function emptyStage(stage: ChainSection): Omit<ChainStage, "inherited" | "input" | "hasMismatch"> {
  return {
    stage,
    unit: stage.unitType,
    recordedIn: 0,
    output: 0,
    rejected: 0,
    rework: 0,
    balance: 0,
    isStarted: false,
    txns: [],
    byLot: [],
    bySize: [],
    byLotSize: [],
    reworkBySize: [],
    material: null,
    lastEntryDate: null,
  };
}

/**
 * Rolls the ledgers up into one flow per stage, for one order's own stage
 * plan.
 *
 * Order of resolution for a stage's input, highest priority first:
 *   1. what was physically counted in here (sum of qty_in)
 *   2. what the previous comparable stage sent on
 *   3. the stage's own baseline - PO pieces for PCS stages, the material plan
 *      for whichever stage draws the material baseline (Knitting, normally)
 *
 * Step 2 is why leaving one stage's form blank doesn't blank out the stages
 * after it. Step 3 only ever applies where a real external figure exists, so
 * a KG stage mid-chain can't invent a quantity out of nowhere.
 */
export function buildProductionChain(input: ChainInput): ProductionChain {
  const { txns, lots, requirements, materialEntries, totalPcs, sizes } = input;

  const sorted = [...input.sections].sort((a, b) => a.seq - b.seq);
  const lotsById = new Map(lots.map((l) => [l.id, l]));

  const requirementFlows = requirements
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((r) => buildRequirementFlow(r, materialEntries));

  const yarnFlows = requirementFlows.filter((f) => f.requirement.category === "yarn");
  const fabricFlows = requirementFlows.filter((f) => f.requirement.category === "fabric");
  const materialTotals = {
    yarn: sumMaterialTotals(yarnFlows),
    fabric: sumMaterialTotals(fabricFlows),
    all: sumMaterialTotals(requirementFlows),
  };

  const result: ChainStage[] = [];

  // What the size-origin stage produced per (lot, size). The size-origin
  // stage is itself normally a no-lot-tracking stage (see below), so its
  // byLotSize block never runs and this map is never actually populated -
  // kept only because byLotSize's still-generic code reads it for whichever
  // stage isn't no-lot-tracking. The real, currently-used reference is
  // cutBySizeGlobal below.
  const cutByCell = new Map<string, number>();
  // What the size-origin stage produced per SIZE, across every lot -
  // captured when the loop reaches that stage (which, by the order-creation
  // validation rules, always precedes every other PCS stage in `seq` order)
  // and used from then on as the fixed reference every later PCS stage's
  // cutQty measures against, so no stage has to invent a size quantity or
  // fall back to the PO's ordered figure just because it (or the size-origin
  // stage itself) doesn't track lots any more.
  const cutBySizeGlobal = new Map<string, number>();
  // The previous PCS stage's output per cell, i.e. what is actually available
  // to the stage currently being built. Replaced at the end of each PCS stage.
  let prevCellOutput = new Map<string, number>();
  // The same idea one axis coarser: the previous stage's output per LOT, which
  // is what the KG half of the line travels on, since it has no size axis
  // until the size-origin stage creates one.
  let prevLotOutput = new Map<string, number>();

  sorted.forEach((stage, index) => {
    const base = emptyStage(stage);
    const sectionTxns = txns
      .filter((t) => t.sectionId === stage.id)
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));
    // Rework rows are a side ledger (see ReworkSizeFlow) - excluded here so
    // they can never inflate recordedIn/output/byLot/bySize, and rolled up
    // separately below instead.
    const stageTxns = sectionTxns.filter((t) => t.txnType !== "rework");
    const reworkTxns = sectionTxns.filter((t) => t.txnType === "rework");

    base.txns = stageTxns;
    base.recordedIn = sum(stageTxns, (t) => t.qtyIn);
    base.output = sum(stageTxns, (t) => t.qtyOut);
    base.rejected = sum(stageTxns, (t) => t.qtyRejected);
    base.rework = sum(stageTxns, (t) => t.qtyRework);
    base.lastEntryDate = stageTxns.length ? stageTxns[stageTxns.length - 1].entryDate : null;
    base.isStarted = stageTxns.length > 0;

    // --- Carry-over from the previous comparable stage ---------------------
    const prev = result[index - 1];
    const prevStage = sorted[index - 1];
    const sameUnit = prevStage ? prevStage.unitType === stage.unitType : false;
    let inherited = prev && sameUnit ? prev.output : 0;

    // --- Procurement stages read the material ledger instead ---------------
    if (stage.isProcurement) {
      const totals = materialTotals.all;
      base.material = totals;
      base.isStarted =
        base.isStarted || requirementFlows.length > 0 || totals.planned + totals.dc + totals.received + totals.inward > 0;

      // Procurement is a chain of three DIFFERENT figures - required →
      // planned → received - not one figure restated three times. Each stage
      // takes the previous one's figure as its input and records its own as
      // its output, exactly the way Knitting takes yarn in and gives fabric
      // out.
      if (stage.procurementRank === 1) {
        // The origin of the KG side of the line: nothing upstream to count in,
        // and what it hands on is the requirement it has just written.
        inherited = 0;
        base.recordedIn = 0;
        base.output = totals.required;
      } else if (stage.procurementRank === 2) {
        // In: what Planning said the order needs. Out: what has actually been
        // ordered against it. Balance = still to purchase.
        base.recordedIn = totals.required;
        base.output = totals.dc;
      } else {
        // In: the purchase quantity the supplier owes. Out: what physically
        // arrived, and what the next KG stage therefore has to draw from.
        // Balance = still owed by the supplier. Legacy 'receipt' rows fold in
        // alongside 'inward' for the same reason RequirementFlow.receivedQty
        // does: they are the same physical event under an older name.
        base.recordedIn = totals.dc;
        base.output = totals.inward + totals.received;
      }
      base.lastEntryDate = latestDate(materialEntries.map((e) => e.entryDate), base.lastEntryDate);
    }

    // --- The order's origin stage passes the order through -----------------
    if (stage.isOrderOrigin) {
      inherited = totalPcs;
      base.recordedIn = base.recordedIn > 0 ? base.recordedIn : totalPcs;
      base.output = base.output > 0 ? base.output : totalPcs;
    }

    // --- A passthrough stage plans, it doesn't consume: pass the input through -
    if (stage.isPassthrough && base.output === 0) {
      base.output = inherited;
    }

    // --- Baseline of last resort -------------------------------------------
    // PCS stages fall back to the ordered pieces; the stage flagged as
    // drawing the material baseline (Knitting, normally - wherever the KG
    // chain physically begins) falls back to the material plan.
    let baseline = 0;
    if (stage.unitType === "PCS") baseline = totalPcs;
    else if (stage.drawsMaterialBaseline) {
      baseline = materialTotals.all.inward || materialTotals.all.received || materialTotals.all.required;
    }

    const resolvedInput = base.recordedIn > 0 ? base.recordedIn : inherited > 0 ? inherited : baseline;
    const hasMismatch = base.recordedIn > 0 && inherited > 0 && base.recordedIn !== inherited;

    base.balance = Math.max(resolvedInput - base.output - base.rejected, 0);

    // --- Lot-wise -----------------------------------------------------------
    //
    // Skipped entirely for a no-lot-tracking stage: base.byLot stays [] (its
    // default from emptyStage) instead of picking up a carried-forward lot
    // with every figure at zero, and prevLotOutput passes through unchanged
    // rather than being overwritten by an empty map - a lot-tracking stage
    // placed after one of these would still see whatever the last real
    // lot-tracking stage produced, not nothing.
    if (!stage.noLotTracking) {
      const lotGroups = new Map<string, ProductionTxn[]>();
      for (const t of stageTxns) {
        if (!t.lotId) continue;
        lotGroups.set(t.lotId, [...(lotGroups.get(t.lotId) ?? []), t]);
      }

      // Lots this stage should know about: the ones it has recorded against,
      // plus every lot the previous comparable stage passed on. Without the
      // second set, a stage that hasn't started yet would list no lots at all
      // and the operator would have nothing to select or measure against.
      const knownLots = new Set<string>([
        ...lotGroups.keys(),
        ...(sameUnit ? Array.from(prevLotOutput.keys()) : []),
      ]);
      const nextLotOutput = new Map<string, number>();

      base.byLot = Array.from(knownLots)
        .map((lotId) => {
          const group = lotGroups.get(lotId) ?? [];
          const qtyIn = sum(group, (t) => t.qtyIn);
          const qtyOut = sum(group, (t) => t.qtyOut);
          const qtyRejected = sum(group, (t) => t.qtyRejected);
          const available = sameUnit ? (prevLotOutput.get(lotId) ?? 0) : 0;

          nextLotOutput.set(lotId, qtyOut);

          return {
            lotId,
            lotNo: lotsById.get(lotId)?.lotNo ?? "-",
            qtyIn,
            qtyOut,
            qtyRejected,
            qtyRework: sum(group, (t) => t.qtyRework),
            balance: Math.max(qtyIn - qtyOut - qtyRejected, 0),
            available,
            // A stage that records an intake is measured by it; one that
            // doesn't is measured by what it put out.
            remainingAvailable: Math.max(available - (qtyIn > 0 ? qtyIn : qtyOut), 0),
            lastEntryDate: group.length ? group[group.length - 1].entryDate : null,
            entryCount: group.length,
          };
        })
        .sort((a, b) => a.lotNo.localeCompare(b.lotNo));

      // The lot-origin stage is where a lot's quantity originates - there is
      // no upstream lot figure to inherit, so its own received quantity
      // seeds the chain. A stage with no lot dimension never populates this
      // map; it stays empty until the lot-origin stage's own txns (which do
      // carry lot_id) fill it in.
      prevLotOutput = nextLotOutput;
    }

    // --- Lot × size ---------------------------------------------------------
    //
    // The grain the garment floor works in. Built for every PCS stage that
    // DOES track lots; a no-lot-tracking PCS stage has no size axis until the
    // size-origin stage creates one, for the same reason as byLot above.
    if (stage.unitType === "PCS" && !stage.noLotTracking) {
      const isSizeOrigin = stage.isSizeOrigin;

      // Every cell this stage should show: the ones it has recorded against,
      // plus every cell the size-origin stage created (so a stage that hasn't
      // started yet still lists the sizes it is expected to handle, rather
      // than nothing).
      const cellTxns = new Map<string, ProductionTxn[]>();
      for (const t of stageTxns) {
        if (!t.lotId || !t.sizeCode) continue;
        const key = cellKey(t.lotId, t.sizeCode);
        cellTxns.set(key, [...(cellTxns.get(key) ?? []), t]);
      }

      const knownCells = new Set<string>([...cellTxns.keys(), ...(isSizeOrigin ? [] : cutByCell.keys())]);
      const nextCellOutput = new Map<string, number>();

      base.byLotSize = Array.from(knownCells)
        .map((key) => {
          const [lotId, sizeCode] = key.split("::");
          const group = cellTxns.get(key) ?? [];
          const qtyIn = sum(group, (t) => t.qtyIn);
          const qtyOut = sum(group, (t) => t.qtyOut);
          const qtyRejected = sum(group, (t) => t.qtyRejected);
          const qtyRework = sum(group, (t) => t.qtyRework);

          // The size-origin stage has no upstream cell to measure against -
          // its own output IS the reference.
          const cutQty = isSizeOrigin ? qtyOut : (cutByCell.get(key) ?? 0);
          const available = isSizeOrigin ? cutQty : (prevCellOutput.get(key) ?? cutQty);

          nextCellOutput.set(key, qtyOut);

          const balance = Math.max(available - qtyOut - qtyRejected, 0);
          const status: CellStatus =
            qtyOut === 0 && qtyRejected === 0 && qtyIn === 0
              ? "not_started"
              : balance === 0
                ? "complete"
                : "in_progress";

          return {
            lotId,
            lotNo: lotsById.get(lotId)?.lotNo ?? "-",
            sizeCode,
            cutQty,
            available,
            qtyIn,
            qtyOut,
            qtyRejected,
            qtyRework,
            balance,
            status,
          };
        })
        .sort((a, b) => a.lotNo.localeCompare(b.lotNo) || a.sizeCode.localeCompare(b.sizeCode));

      if (isSizeOrigin) {
        for (const cell of base.byLotSize) cutByCell.set(cellKey(cell.lotId, cell.sizeCode), cell.qtyOut);
      }
      prevCellOutput = nextCellOutput;
    }

    // --- Size-wise ----------------------------------------------------------
    if (stage.unitType === "PCS") {
      const isSizeOrigin = stage.isSizeOrigin;

      base.bySize = sizes.map((s) => {
        const group = stageTxns.filter((t) => t.sizeCode === s.sizeCode);
        const qtyIn = sum(group, (t) => t.qtyIn);
        const qtyOut = sum(group, (t) => t.qtyOut);
        const qtyRejected = sum(group, (t) => t.qtyRejected);
        // The size-origin stage's own output per size IS the reference (it
        // originates the size axis); every stage after it reads what was
        // captured into cutBySizeGlobal when the loop reached that stage.
        // `||`, not `??`: a captured 0 (nothing cut for this size yet) must
        // still fall back to the PO's ordered quantity, the same as never
        // having captured anything at all.
        const cutQty = isSizeOrigin ? qtyOut || s.quantity : (cutBySizeGlobal.get(s.sizeCode) || s.quantity);
        // What this size is measured against: what was counted in, else the
        // cut reference above.
        const sizeInput = qtyIn > 0 ? qtyIn : cutQty;

        return {
          sizeCode: s.sizeCode,
          poQty: s.quantity,
          qtyIn,
          qtyOut,
          qtyRejected,
          balance: Math.max(sizeInput - qtyOut - qtyRejected, 0),
          cutQty,
        };
      });

      if (isSizeOrigin) {
        for (const s of base.bySize) cutBySizeGlobal.set(s.sizeCode, s.qtyOut);
      }
    }

    // --- Rework side ledger --------------------------------------------------
    //
    // Independent of everything above: not chained to the previous stage, not
    // subtracted from balance, never read by any other stage. Just this
    // stage's own running total of what it sent to rework and what came back.
    if (stage.unitType === "PCS") {
      base.reworkBySize = sizes.map((s) => {
        const group = reworkTxns.filter((t) => t.sizeCode === s.sizeCode);
        const added = sum(group, (t) => t.qtyIn);
        const solved = sum(group, (t) => t.qtyOut);
        return { sizeCode: s.sizeCode, added, solved, pending: Math.max(added - solved, 0) };
      });
    }

    result.push({ ...base, inherited, input: resolvedInput, hasMismatch });
  });

  return {
    stages: result,
    byKey: new Map(result.map((s) => [s.stage.key, s])),
    requirementFlows,
    materialTotals,
    totalPcs,
    sizes,
    lots,
  };
}

// ---------------------------------------------------------------------------
// Lot traceability - one lot's journey across every stage that touched it.
// ---------------------------------------------------------------------------

export interface LotJourneyStep {
  stage: ChainSection;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  loss: number;
  unit: UnitType;
}

export interface LotJourney {
  lot: ProductionLot;
  steps: LotJourneyStep[];
  totalLoss: number;
}

/** Follows a single lot from the lot-origin stage to the final-output stage.
 *  This is what the lot number exists for - without it a shortage can be
 *  seen but not located. */
export function buildLotJourney(lot: ProductionLot, chain: ProductionChain): LotJourney {
  const steps: LotJourneyStep[] = [];
  let totalLoss = 0;

  for (const cs of chain.stages) {
    const flow = cs.byLot.find((l) => l.lotId === lot.id);
    if (!flow) continue;
    const loss = Math.max(flow.qtyIn - flow.qtyOut - flow.qtyRejected, 0);
    // Only count loss where the lot was genuinely measured both ways, so a
    // stage that recorded output alone doesn't read as a total write-off.
    if (flow.qtyIn > 0 && flow.qtyOut > 0) totalLoss += loss;
    steps.push({
      stage: cs.stage,
      qtyIn: flow.qtyIn,
      qtyOut: flow.qtyOut,
      qtyRejected: flow.qtyRejected,
      loss,
      unit: cs.unit,
    });
  }

  return { lot, steps, totalLoss };
}

// ---------------------------------------------------------------------------
// Output summary - the final planned-vs-actual comparison.
// ---------------------------------------------------------------------------

export interface OutputRow {
  key: string;
  label: string;
  unit: UnitType;
  input: number;
  output: number;
  rejected: number;
  shortage: number;
  /** output / input as a percentage; null when there's nothing to compare. */
  efficiencyPct: number | null;
}

export interface OutputSummary {
  rows: OutputRow[];
  orderedPcs: number;
  packedPcs: number;
  cutPcs: number;
  totalRejectedPcs: number;
  /** Packed as a percentage of ordered - the headline number. */
  overallEfficiencyPct: number | null;
  /** Ordered - packed. */
  shortfallPcs: number;
  fabricPlannedKg: number;
  fabricInhouseKg: number;
  fabricLossKg: number;
}

export function buildOutputSummary(chain: ProductionChain): OutputSummary {
  const rows: OutputRow[] = [];

  // Loss-analysis rows: every stage this order's own plan flags as worth
  // showing (planning and pass-through stages would only add rows where
  // input always equals output), in the order's own configured sequence.
  for (const cs of chain.stages) {
    if (!cs.stage.includeInLossRows) continue;
    const shortage = Math.max(cs.input - cs.output - cs.rejected, 0);
    rows.push({
      key: cs.stage.key,
      label: cs.stage.label,
      unit: cs.unit,
      input: cs.input,
      output: cs.output,
      rejected: cs.rejected,
      shortage,
      efficiencyPct: cs.input > 0 ? round1((cs.output / cs.input) * 100) : null,
    });
  }

  const packedPcs = chain.stages.find((s) => s.stage.isFinalOutput)?.output ?? 0;
  const cutPcs = chain.stages.find((s) => s.stage.isSizeOrigin)?.output ?? 0;
  const orderedPcs = chain.totalPcs;

  const totalRejectedPcs = chain.stages
    .filter((s) => s.unit === "PCS")
    .reduce((sum, s) => sum + s.rejected, 0);

  const fabricPlannedKg = chain.materialTotals.all.required;
  const fabricInhouseKg = chain.stages.find((s) => s.stage.isFabricCheckpoint)?.input ?? 0;

  return {
    rows,
    orderedPcs,
    packedPcs,
    cutPcs,
    totalRejectedPcs,
    overallEfficiencyPct: orderedPcs > 0 ? round1((packedPcs / orderedPcs) * 100) : null,
    shortfallPcs: Math.max(orderedPcs - packedPcs, 0),
    fabricPlannedKg,
    fabricInhouseKg,
    fabricLossKg: Math.max(fabricPlannedKg - fabricInhouseKg, 0),
  };
}

/**
 * Size-wise ordered → cut → packed comparison for the Output dashboard.
 *
 * sewn/packed/balance are null, not 0, whenever that stage has no size-wise
 * entries at all (Sewing and Packing typically record one overall figure
 * rather than a size grid), OR whenever this order's plan doesn't happen to
 * include a stage by that name at all - both cases render as "-" rather than
 * a misleading "fully short against every size".
 */
export interface SizeOutputRow {
  sizeCode: string;
  ordered: number;
  cut: number;
  sewn: number | null;
  packed: number | null;
  balance: number | null;
}

export function buildSizeOutput(chain: ProductionChain): SizeOutputRow[] {
  const cut = chain.stages.find((s) => s.stage.isSizeOrigin);
  // "Sewn" is a purely cosmetic milestone column with no structural role of
  // its own - looked up by the frozen catalog key, exactly like the old
  // app's STAGE.sewing lookup. Degrades to null (not shown) if this order's
  // plan doesn't include a stage keyed "sewing".
  const sewn = chain.byKey.get("sewing");
  const packed = chain.stages.find((s) => s.stage.isFinalOutput);

  const sewnTracksSize = (sewn?.bySize.length ?? 0) > 0;
  const packedTracksSize = (packed?.bySize.length ?? 0) > 0;

  return chain.sizes.map((s) => {
    const cutQty = cut?.bySize.find((x) => x.sizeCode === s.sizeCode)?.qtyOut ?? 0;
    const sewnQty = sewnTracksSize
      ? sewn?.bySize.find((x) => x.sizeCode === s.sizeCode)?.qtyOut ?? 0
      : null;
    const packedQty = packedTracksSize
      ? packed?.bySize.find((x) => x.sizeCode === s.sizeCode)?.qtyOut ?? 0
      : null;
    return {
      sizeCode: s.sizeCode,
      ordered: s.quantity,
      cut: cutQty,
      sewn: sewnQty,
      packed: packedQty,
      balance: packedQty == null ? null : s.quantity - packedQty,
    };
  });
}

// ---------------------------------------------------------------------------

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
}

function latestDate(dates: string[], current: string | null): string | null {
  return dates.reduce<string | null>((latest, d) => (!latest || d > latest ? d : latest), current);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
