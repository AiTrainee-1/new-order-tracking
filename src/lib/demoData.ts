import type { StagePlanCatalogEntry } from "./stagePlan";
import type {
  ChainSection,
  MaterialEntry,
  MaterialRequirement,
  Order,
  PoSizeQuantity,
  ProductionLot,
  ProductionTxn,
  PurchaseOrder,
  StageEntry,
} from "./types";

/**
 * A complete, self-contained order that exists only in memory.
 *
 * It backs the Preview sandbox on Stage Roles: the real stage forms are
 * rendered against this instead of the database, so someone can fill fields
 * in, press the buttons and watch the totals move without a single row being
 * written anywhere.
 *
 * Every id is prefixed `demo-`. That prefix is the safety net - the guards in
 * useProductionChain.ts / useStageEntries.ts / useEntryUser.ts refuse to touch
 * the network while demo mode is on, and any id that did somehow escape is
 * obviously not a real cuid.
 */

export const DEMO_PREFIX = "demo-";
export const DEMO_ORDER_ID = `${DEMO_PREFIX}order`;
export const DEMO_PO_ID = `${DEMO_PREFIX}po`;

/** The fabricated stage-plan rows. `sectionId` on every ledger row points at
 *  one of these - see buildDemoSections below for what each one is for. */
export const DEMO_ORIGIN_SECTION_ID = `${DEMO_PREFIX}section-origin`;
export const DEMO_UPSTREAM_SECTION_ID = `${DEMO_PREFIX}section-upstream`;
export const DEMO_PREVIEW_SECTION_ID = `${DEMO_PREFIX}section-preview`;

/** Who the sandbox attributes entries to. useEntryUser() returns this instead
 *  of the signed-in user while a DemoModeProvider is mounted, so nothing the
 *  practice run writes carries a real user id. */
export const DEMO_USER = { id: `${DEMO_PREFIX}user`, name: "Preview" };

export const DEMO_ORDER: Order = {
  id: DEMO_ORDER_ID,
  ioNo: "DEMO/01",
  style: "SAMPLE CREW SWEATSHIRT",
  description: "PRACTICE ORDER - nothing here is real",
  color: "NAVY",
  fabric: "Brushed Back Fleece 60% Cotton 40% Poly - 280GSM",
  imageId: null,
  totalQty: 1000,
  cutQuantity: null,
  deliveryDate: "2026-12-31",
  createdBy: null,
  isHidden: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const DEMO_PO: PurchaseOrder = {
  id: DEMO_PO_ID,
  orderId: DEMO_ORDER_ID,
  poNumber: "DEMO-0001",
  quantity: 1000,
  cutQuantity: null,
  // Deliberately 0: the sandbox's size grid targets then equal the buyer
  // figures exactly, so a practice quantity typed against "L: 350" lands on
  // the number the preview shows rather than an extra%-inflated one.
  extraPercent: 0,
  deliveryDate: "2026-12-15",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const SIZE_SPLIT: [string, number][] = [
  ["S", 150],
  ["M", 300],
  ["L", 350],
  ["XL", 200],
];

export const DEMO_SIZES: PoSizeQuantity[] = SIZE_SPLIT.map(([sizeCode, quantity], i) => ({
  id: `${DEMO_PREFIX}size-${sizeCode}`,
  poId: DEMO_PO_ID,
  sizeCode,
  sortOrder: i,
  quantity,
  createdAt: "2026-01-01T00:00:00.000Z",
}));

export const DEMO_LOTS: ProductionLot[] = [
  {
    id: `${DEMO_PREFIX}lot-1`,
    orderId: DEMO_ORDER_ID,
    poId: DEMO_PO_ID,
    lotNo: "LOT-001",
    fabricType: "Single Jersey",
    notes: null,
    createdBy: null,
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: `${DEMO_PREFIX}lot-2`,
    orderId: DEMO_ORDER_ID,
    poId: DEMO_PO_ID,
    lotNo: "LOT-002",
    fabricType: "Single Jersey",
    notes: null,
    createdBy: null,
    createdAt: "2026-06-04T00:00:00.000Z",
  },
];

const REQUIREMENT_SPEC: [string, "yarn" | "fabric", number][] = [
  ["40s Combed Cotton", "yarn", 260],
  ["30s Poly", "yarn", 180],
];

export const DEMO_REQUIREMENTS: MaterialRequirement[] = REQUIREMENT_SPEC.map(
  ([name, category, requiredQty], i) => ({
    id: `${DEMO_PREFIX}req-${i}`,
    orderId: DEMO_ORDER_ID,
    poId: DEMO_PO_ID,
    category,
    name,
    requiredQty,
    unit: "KG",
    supplier: "Sample Spinning Mills",
    sortOrder: i,
    isCompleted: false,
    notes: null,
    createdBy: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedBy: null,
    updatedAt: "2026-05-01T00:00:00.000Z",
  }),
);

/**
 * One purchase row and one (deliberately partial) inward row per material.
 *
 * Only the two entry types the simplified procurement flow actually uses:
 * "dc" (Purchase Quantity, entered on Purchase Order to Suppliers) and
 * "inward" (Inward Confirmation, entered on Raw Material Inward). Planning
 * records nothing beyond the requirement itself.
 *
 * Inward is ~68% of what was purchased on purpose: previewing Raw Material
 * Inward against a fully-received order would leave nothing to practise on,
 * and the outstanding balance is the thing that stage exists to chase.
 */
export const DEMO_MATERIAL_ENTRIES: MaterialEntry[] = DEMO_REQUIREMENTS.flatMap((r, ri) => {
  const inward = Math.round(r.requiredQty * 0.68);
  return [
    {
      id: `${DEMO_PREFIX}mat-${ri}-dc`,
      requirementId: r.id,
      entryType: "dc" as const,
      qty: r.requiredQty,
      entryDate: "2026-05-10",
      supplier: "Sample Spinning Mills",
      docNo: `DC-100${ri + 1}`,
      docDate: "2026-05-10",
      lotRef: null,
      notes: null,
      enteredBy: DEMO_USER.id,
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedBy: null,
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
    {
      id: `${DEMO_PREFIX}mat-${ri}-inward`,
      requirementId: r.id,
      entryType: "inward" as const,
      qty: inward,
      entryDate: "2026-05-18",
      supplier: "Sample Spinning Mills",
      docNo: null,
      docDate: null,
      lotRef: null,
      notes: "First delivery - weighed at gate.",
      enteredBy: DEMO_USER.id,
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedBy: null,
      updatedAt: "2026-05-18T00:00:00.000Z",
    },
  ];
});

/** What the fabricated upstream KG stage hands on, per demo lot. Small enough
 *  to be plausible for a 1,000 pc order, big enough that every ceiling check in
 *  StageLedger has real headroom to practise against. */
const UPSTREAM_KG: [lotIndex: number, qtyIn: number, qtyOut: number][] = [
  [0, 240, 232],
  [1, 195, 188],
];

const UPSTREAM_KG_OUT = UPSTREAM_KG.reduce((sum, [, , out]) => sum + out, 0);
const UPSTREAM_KG_IN = UPSTREAM_KG.reduce((sum, [, inQty]) => sum + inQty, 0);

// ---------------------------------------------------------------------------
// The fabricated stage plan
// ---------------------------------------------------------------------------

/**
 * Two or three ChainSection rows that make ONE previewed stage render with
 * real numbers in it.
 *
 * The rule the whole chain rests on (chain.ts's module comment) is
 * "a stage's input = the previous comparable stage's output", resolved as
 * `recordedIn > 0 ? recordedIn : inherited > 0 ? inherited : baseline`, where
 * `inherited` is `sections[index - 1].output` and ONLY when the two rows share
 * a unitType. So the previewed stage needs a predecessor of its own unit that
 * has actually put something out, otherwise it opens showing zeroes:
 *
 *   PCS stages - one predecessor is enough. Row 0 is a PCS order-origin row;
 *     chain.ts forces `inherited = totalPcs` and `output = totalPcs` on an
 *     order-origin stage, so the previewed PCS stage inherits the full 1,000
 *     pieces with no seeded ledger rows at all. Its size axis comes from the
 *     PO (`bySize` is built from `sizes` for every PCS stage, and `cutQty`
 *     falls back to the PO's own quantity with `|| s.quantity` when no
 *     size-origin stage ran) - which is why nothing here has to be flagged
 *     isSizeOrigin to get a usable size grid.
 *
 *   KG stages - the origin row is PCS, so `sameUnit` is false there and
 *     nothing carries across it. They get a second, synthetic KG row in
 *     between, carrying lot-keyed txns (see buildDemoTxns): that row's output
 *     becomes the previewed stage's `inherited`, and its per-lot output becomes
 *     each LotFlow's `available` - the ceiling the lot-wise forms ration
 *     entries against, and the reason a lot picker in the sandbox shows a lot
 *     with a real quantity behind it rather than an empty dropdown.
 *
 * Deliberate simplifications, because this is a practice sandbox and not a
 * real order:
 *   - The previewed row is never flagged `isOrderOrigin`, even when previewing
 *     Order Confirmation itself. Row 0 already plays that part; letting the
 *     previewed row claim it too would make chain.ts backfill its recordedIn
 *     and output with the order total, so the stage would open reading as
 *     already confirmed.
 *   - It is never flagged `isSizeOrigin` either. Doing so would make
 *     `SizeFlow.cutQty` equal to whatever was just typed (`qtyOut || quantity`),
 *     which collapses every size's remaining target to zero the moment a
 *     practice quantity is saved. Leaving it false keeps each size measured
 *     against the PO figure, which is what makes the grid usable repeatedly.
 *   - `isLotOrigin` is copied from the catalog's `canBeLotOrigin`, and is
 *     purely cosmetic: neither chain.ts nor progress.ts reads that flag.
 *   - The upstream KG row exists for procurement stages too. It changes
 *     nothing for them (chain.ts overrides a procurement stage's inherited /
 *     recordedIn / output from the material ledger regardless), and keeping
 *     one shape for every KG stage keeps the sandbox to one code path.
 */
export function buildDemoSections(stage: StagePlanCatalogEntry): ChainSection[] {
  const origin: ChainSection = {
    id: DEMO_ORIGIN_SECTION_ID,
    stageDefinitionId: `${DEMO_PREFIX}def-origin`,
    seq: 1,
    key: "order_confirmation",
    label: "Order Confirmation",
    unitType: "PCS",
    formType: "confirmation",
    typicalDurationDays: 2,
    noLotTracking: true,
    isOrderOrigin: true,
    isProcurement: false,
    procurementRank: null,
    isLotOrigin: false,
    isSizeOrigin: false,
    isPassthrough: false,
    isFinalOutput: false,
    isFabricCheckpoint: false,
    drawsMaterialBaseline: false,
    includeInLossRows: false,
  };

  const sections: ChainSection[] = [origin];

  if (stage.unitType === "KG") {
    sections.push({
      id: DEMO_UPSTREAM_SECTION_ID,
      stageDefinitionId: `${DEMO_PREFIX}def-upstream`,
      seq: 2,
      key: "demo_upstream",
      label: "Previous Stage",
      unitType: "KG",
      formType: "lot_process",
      typicalDurationDays: 3,
      noLotTracking: false,
      isOrderOrigin: false,
      isProcurement: false,
      procurementRank: null,
      isLotOrigin: true,
      isSizeOrigin: false,
      isPassthrough: false,
      isFinalOutput: false,
      isFabricCheckpoint: false,
      drawsMaterialBaseline: true,
      includeInLossRows: true,
    });
  }

  sections.push({
    id: DEMO_PREVIEW_SECTION_ID,
    stageDefinitionId: stage.id,
    seq: sections.length + 1,
    key: stage.key,
    label: stage.label,
    unitType: stage.unitType,
    formType: stage.formType,
    typicalDurationDays: stage.typicalDurationDays,
    noLotTracking: stage.noLotTracking,
    isOrderOrigin: false,
    isProcurement: stage.isProcurement,
    procurementRank: stage.procurementRank,
    isLotOrigin: stage.canBeLotOrigin,
    isSizeOrigin: false,
    isPassthrough: stage.isPassthrough,
    isFinalOutput: stage.isFinalOutput,
    isFabricCheckpoint: stage.isFabricCheckpoint,
    drawsMaterialBaseline: stage.drawsMaterialBaseline,
    includeInLossRows: stage.includeInLossRows,
  });

  return sections;
}

// ---------------------------------------------------------------------------
// Seed ledgers
// ---------------------------------------------------------------------------

function txn(over: Partial<ProductionTxn> & { id: string; sectionId: string; unit: "KG" | "PCS" }): ProductionTxn {
  return {
    orderId: DEMO_ORDER_ID,
    poId: DEMO_PO_ID,
    lotId: null,
    sizeCode: null,
    txnType: "process",
    qtyIn: 0,
    qtyOut: 0,
    qtyRejected: 0,
    qtyRework: 0,
    refName: null,
    docNo: null,
    entryDate: "2026-06-10",
    notes: null,
    enteredBy: DEMO_USER.id,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedBy: null,
    updatedAt: "2026-06-10T00:00:00.000Z",
    isJobWork: false,
    ...over,
  };
}

/**
 * The seeded production ledger - what the stage BEFORE the previewed one has
 * already done.
 *
 * Only the synthetic upstream KG row gets rows, and only when the previewed
 * stage is itself a KG stage (see buildDemoSections). The previewed stage's
 * own ledger is deliberately left empty: the point of the sandbox is to watch
 * your own entries appear and the totals move, which is much clearer starting
 * from a clean stage than from a pre-filled one.
 *
 * PCS stages need no seed at all - chain.ts's order-origin rule hands them the
 * whole PO.
 */
export function buildDemoTxns(sections: ChainSection[]): ProductionTxn[] {
  if (!sections.some((s) => s.id === DEMO_UPSTREAM_SECTION_ID)) return [];
  return UPSTREAM_KG.map(([lotIndex, qtyIn, qtyOut]) =>
    txn({
      id: `${DEMO_PREFIX}txn-upstream-${lotIndex}`,
      sectionId: DEMO_UPSTREAM_SECTION_ID,
      unit: "KG",
      lotId: DEMO_LOTS[lotIndex].id,
      qtyIn,
      qtyOut,
      refName: "Sample Processing Unit",
      notes: "Seeded practice history.",
    }),
  );
}

function stageEntry(over: Partial<StageEntry> & { id: string; sectionId: string }): StageEntry {
  return {
    orderId: DEMO_ORDER_ID,
    poId: null,
    entryDate: "2026-06-09",
    unitType: "PCS",
    qtyReceived: 0,
    qtyCompletedToday: 0,
    qtyForwarded: 0,
    qtyShortage: 0,
    qtyRejected: 0,
    qtyReturned: 0,
    isExternal: false,
    externalUnitName: null,
    isSentOutside: false,
    isReturned: false,
    isForwarded: true,
    isCompleted: true,
    branch: null,
    unitName: null,
    transferType: "none",
    transferTo: null,
    notes: "Seeded practice history.",
    enteredBy: DEMO_USER.id,
    forwardedToUserId: null,
    createdAt: "2026-06-09T00:00:00.000Z",
    ...over,
  };
}

/**
 * The seeded gating log - one completed entry per stage ABOVE the previewed
 * one.
 *
 * progress.ts unlocks a stage when `index === 0 || every earlier stage is
 * completed or partial`, so without these the previewed stage would render as
 * still locked. Their `qtyForwarded` is also what becomes the previewed
 * stage's `qtyInherited`, which is what StageProgress shows as the quantity
 * handed down to it.
 *
 * Nothing is seeded against the previewed stage itself, so its own
 * `qtyForwarded` starts at 0 - every chain form computes what it forwards as a
 * DELTA against that figure, and a non-zero start would silently swallow the
 * first practice movement.
 */
export function buildDemoStageEntries(sections: ChainSection[]): StageEntry[] {
  const entries: StageEntry[] = [
    stageEntry({
      id: `${DEMO_PREFIX}entry-origin`,
      sectionId: DEMO_ORIGIN_SECTION_ID,
      unitType: "PCS",
      qtyReceived: DEMO_PO.quantity,
      qtyCompletedToday: DEMO_PO.quantity,
      qtyForwarded: DEMO_PO.quantity,
    }),
  ];

  if (sections.some((s) => s.id === DEMO_UPSTREAM_SECTION_ID)) {
    entries.push(
      stageEntry({
        id: `${DEMO_PREFIX}entry-upstream`,
        sectionId: DEMO_UPSTREAM_SECTION_ID,
        unitType: "KG",
        qtyReceived: UPSTREAM_KG_IN,
        qtyCompletedToday: UPSTREAM_KG_OUT,
        qtyForwarded: UPSTREAM_KG_OUT,
      }),
    );
  }

  return entries;
}
