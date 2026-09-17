"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEMO_ACCESSORY_ENTRIES,
  DEMO_ACCESSORY_REQUIREMENTS,
  DEMO_LOTS,
  DEMO_MATERIAL_ENTRIES,
  DEMO_ORDER,
  DEMO_ORDER_ID,
  DEMO_PO,
  DEMO_PO_ID,
  DEMO_PREFIX,
  DEMO_REQUIREMENTS,
  DEMO_SIZES,
  DEMO_USER,
  buildDemoStageEntries,
  buildDemoTxns,
} from "@/lib/demoData";
import type {
  AccessoryEntry,
  AccessoryRequirement,
  ChainSection,
  MaterialEntry,
  MaterialRequirement,
  Order,
  PoSizeQuantity,
  ProductionLot,
  ProductionTxn,
  PurchaseOrder,
  StageEntry,
} from "@/lib/types";

/**
 * Demo mode - the sandbox behind the Preview button on Stage Roles.
 *
 * The real stage forms are rendered inside this provider so someone can try
 * them out: fill fields, add entries, press the buttons, watch the totals
 * move. Nothing reaches the database.
 *
 * The guarantee is enforced at the READ AND THE WRITE THEMSELVES, not around
 * them. Every hook in useProductionChain.ts / useStageEntries.ts /
 * useEntryUser.ts asks `useDemoStore()` first and, if it gets a store back,
 * serves this in-memory state and returns without issuing a request. Putting
 * the check at the point of the fetch means anyone reading `useCreateTxns` can
 * see the protection - a wrapper further out would be one refactor away from
 * being bypassed silently.
 *
 * Outside the provider `useDemoStore()` returns null and every hook behaves
 * exactly as it did before this file existed.
 */

/** The shape useProductionBundle serves. Declared here rather than imported
 *  from the hook so this file has no dependency on the hooks that depend on
 *  it; it is structurally the same type. */
export interface DemoBundle {
  sizes: PoSizeQuantity[];
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  txns: ProductionTxn[];
  accessoryRequirements: AccessoryRequirement[];
  accessoryEntries: AccessoryEntry[];
}

type DemoNewTxn = Omit<ProductionTxn, "id" | "createdAt" | "updatedAt" | "updatedBy">;
type DemoNewStageEntry = Omit<StageEntry, "id" | "createdAt" | "enteredBy">;

export interface DemoStore {
  order: Order;
  purchaseOrders: PurchaseOrder[];
  /** The fabricated stage plan - what useOrderStagePlan serves. */
  sections: ChainSection[];
  bundle: DemoBundle;
  stageEntries: StageEntry[];

  addTxns: (rows: DemoNewTxn[]) => ProductionTxn[];
  patchTxn: (id: string, patch: Partial<ProductionTxn>) => void;
  addLot: (input: { lotNo: string; poId: string | null; fabricType?: string | null; notes?: string | null }) => ProductionLot;
  removeLot: (id: string) => void;
  saveRequirement: (id: string | undefined, input: Partial<MaterialRequirement>) => void;
  removeRequirement: (id: string) => void;
  saveMaterialEntry: (id: string | undefined, input: Partial<MaterialEntry>) => void;
  removeMaterialEntry: (id: string) => void;
  /** No update/remove for accessories - permanent once created, matching the
   *  real API's POST-only surface (see accessory-requirements/route.ts). */
  addAccessoryRequirement: (input: Partial<AccessoryRequirement>) => AccessoryRequirement;
  addAccessoryEntry: (input: Partial<AccessoryEntry>) => AccessoryEntry;
  addStageEntry: (row: DemoNewStageEntry) => void;
  /** Throws the sandbox away and rebuilds it from the fixtures. */
  reset: () => void;
}

const DemoModeContext = createContext<DemoStore | null>(null);

let idSeq = 0;
const nextId = (kind: string) => `${DEMO_PREFIX}${kind}-${(idSeq += 1)}`;
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

interface DemoState {
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  txns: ProductionTxn[];
  stageEntries: StageEntry[];
  accessoryRequirements: AccessoryRequirement[];
  accessoryEntries: AccessoryEntry[];
}

function initialState(sections: ChainSection[]): DemoState {
  return {
    lots: [...DEMO_LOTS],
    requirements: [...DEMO_REQUIREMENTS],
    materialEntries: [...DEMO_MATERIAL_ENTRIES],
    txns: buildDemoTxns(sections),
    stageEntries: buildDemoStageEntries(sections),
    accessoryRequirements: [...DEMO_ACCESSORY_REQUIREMENTS],
    accessoryEntries: [...DEMO_ACCESSORY_ENTRIES],
  };
}

export function DemoModeProvider({
  sections,
  children,
}: {
  /** The fabricated stage plan the sandbox runs against - built once by
   *  StagePreviewSandbox from the previewed catalog row. The seed ledgers are
   *  generated against it so they line up with whichever stage is on screen. */
  sections: ChainSection[];
  children: ReactNode;
}) {
  const [state, setState] = useState<DemoState>(() => initialState(sections));

  const reset = useCallback(() => setState(initialState(sections)), [sections]);

  const store = useMemo<DemoStore>(
    () => ({
      order: DEMO_ORDER,
      purchaseOrders: [DEMO_PO],
      sections,
      bundle: {
        sizes: DEMO_SIZES,
        lots: state.lots,
        requirements: state.requirements,
        materialEntries: state.materialEntries,
        txns: state.txns,
        accessoryRequirements: state.accessoryRequirements,
        accessoryEntries: state.accessoryEntries,
      },
      stageEntries: state.stageEntries,

      addTxns: (rows) => {
        const created = rows.map((r) => ({
          ...r,
          id: nextId("txn"),
          createdAt: nowIso(),
          updatedBy: null,
          updatedAt: nowIso(),
        }));
        setState((prev) => ({ ...prev, txns: [...prev.txns, ...created] }));
        return created;
      },

      patchTxn: (id, patch) =>
        setState((prev) => ({
          ...prev,
          txns: prev.txns.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowIso() } : t)),
        })),

      addLot: ({ lotNo, poId, fabricType = null, notes = null }) => {
        const lot: ProductionLot = {
          id: nextId("lot"),
          orderId: DEMO_ORDER_ID,
          poId,
          lotNo,
          fabricType,
          notes,
          createdBy: DEMO_USER.id,
          createdAt: nowIso(),
        };
        setState((prev) => ({ ...prev, lots: [...prev.lots, lot] }));
        return lot;
      },

      removeLot: (id) => setState((prev) => ({ ...prev, lots: prev.lots.filter((l) => l.id !== id) })),

      saveRequirement: (id, input) =>
        setState((prev) => {
          if (id) {
            return {
              ...prev,
              requirements: prev.requirements.map((r) => (r.id === id ? { ...r, ...input, updatedAt: nowIso() } : r)),
            };
          }
          const created: MaterialRequirement = {
            id: nextId("req"),
            orderId: DEMO_ORDER_ID,
            poId: DEMO_PO_ID,
            category: "yarn",
            name: "",
            requiredQty: 0,
            unit: "KG",
            supplier: null,
            sortOrder: prev.requirements.length,
            isCompleted: false,
            notes: null,
            createdBy: DEMO_USER.id,
            createdAt: nowIso(),
            updatedBy: null,
            updatedAt: nowIso(),
            ...input,
          };
          return { ...prev, requirements: [...prev.requirements, created] };
        }),

      removeRequirement: (id) =>
        setState((prev) => ({
          ...prev,
          requirements: prev.requirements.filter((r) => r.id !== id),
          materialEntries: prev.materialEntries.filter((e) => e.requirementId !== id),
        })),

      saveMaterialEntry: (id, input) =>
        setState((prev) => {
          if (id) {
            return {
              ...prev,
              materialEntries: prev.materialEntries.map((e) =>
                e.id === id ? { ...e, ...input, updatedAt: nowIso() } : e,
              ),
            };
          }
          const created: MaterialEntry = {
            id: nextId("mat"),
            requirementId: "",
            entryType: "dc",
            qty: 0,
            entryDate: today(),
            supplier: null,
            docNo: null,
            docDate: null,
            lotRef: null,
            notes: null,
            enteredBy: DEMO_USER.id,
            createdAt: nowIso(),
            updatedBy: null,
            updatedAt: nowIso(),
            ...input,
          };
          return { ...prev, materialEntries: [...prev.materialEntries, created] };
        }),

      removeMaterialEntry: (id) =>
        setState((prev) => ({ ...prev, materialEntries: prev.materialEntries.filter((e) => e.id !== id) })),

      addAccessoryRequirement: (input) => {
        const created: AccessoryRequirement = {
          id: nextId("acc-req"),
          orderId: DEMO_ORDER_ID,
          poId: DEMO_PO_ID,
          name: "",
          requiredQty: 0,
          unit: "PCS",
          requiredDate: null,
          sortOrder: 0,
          notes: null,
          createdBy: DEMO_USER.id,
          createdAt: nowIso(),
          ...input,
        };
        setState((prev) => ({
          ...prev,
          accessoryRequirements: [
            ...prev.accessoryRequirements,
            { ...created, sortOrder: input.sortOrder ?? prev.accessoryRequirements.length },
          ],
        }));
        return created;
      },

      addAccessoryEntry: (input) => {
        const created: AccessoryEntry = {
          id: nextId("acc-entry"),
          requirementId: "",
          entryType: "purchase",
          qty: 0,
          entryDate: today(),
          vendor: null,
          docNo: null,
          sentTo: null,
          notes: null,
          enteredBy: DEMO_USER.id,
          createdAt: nowIso(),
          ...input,
        };
        setState((prev) => ({ ...prev, accessoryEntries: [...prev.accessoryEntries, created] }));
        return created;
      },

      addStageEntry: (row) =>
        setState((prev) => ({
          ...prev,
          stageEntries: [...prev.stageEntries, { ...row, id: nextId("entry"), enteredBy: DEMO_USER.id, createdAt: nowIso() }],
        })),

      reset,
    }),
    [state, sections, reset],
  );

  return <DemoModeContext.Provider value={store}>{children}</DemoModeContext.Provider>;
}

/**
 * The sandbox store, or null when running against the real database.
 *
 * Every hook that reads or writes production data checks this first. `null`
 * means "behave normally" - which is the case everywhere except inside a
 * Preview.
 */
export function useDemoStore(): DemoStore | null {
  return useContext(DemoModeContext);
}
