"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDemoStore } from "@/context/DemoModeContext";
import { buildProductionChain, type ProductionChain } from "@/lib/chain";
import { effectiveSizes, sortSizes } from "@/lib/sizes";
import type {
  AccessoryEntry,
  AccessoryRequirement,
  AuditLogRow,
  ChainSection,
  MaterialEntry,
  MaterialRequirement,
  PoSizeQuantity,
  ProductionLot,
  ProductionTxn,
  PurchaseOrder,
} from "@/lib/types";

/**
 * All four production ledgers for one order, fetched together and assembled
 * into a ProductionChain - see prisma/schema.prisma's OrderStagePlan comment
 * and src/lib/chain.ts's module comment for why this has to be whole-order
 * rather than per-stage.
 *
 * Demo mode (the Preview sandbox on Stage Roles) is guarded here, at the fetch
 * and at the write: every hook below asks `useDemoStore()` first and, inside a
 * DemoModeProvider, serves or updates the in-memory demo store without issuing
 * a request. The reads additionally switch their `enabled` off, so not even a
 * background refetch can escape. Outside a provider `demo` is null and every
 * path is exactly what it was before. See src/context/DemoModeContext.tsx.
 */

const KEY = "production_chain";

export interface ProductionBundle {
  sizes: PoSizeQuantity[];
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  txns: ProductionTxn[];
  accessoryRequirements: AccessoryRequirement[];
  accessoryEntries: AccessoryEntry[];
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export function useProductionBundle(orderId: string | undefined) {
  const demo = useDemoStore();
  const query = useQuery({
    queryKey: [KEY, orderId],
    enabled: !!orderId && !demo,
    queryFn: async () => (await jsonFetch<{ bundle: ProductionBundle }>(`/api/orders/${orderId}/bundle`)).bundle,
  });
  if (demo) return { data: demo.bundle, isLoading: false, isError: false };
  return query;
}

/** The order's stage plan, in seq order - this order's own dynamic sequence,
 *  not the global catalog (see ChainSection in lib/types.ts). */
export function useOrderStagePlan(orderId: string | undefined) {
  const demo = useDemoStore();
  const query = useQuery({
    queryKey: ["order_stage_plan", orderId],
    enabled: !!orderId && !demo,
    queryFn: async (): Promise<ChainSection[]> => {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the order.");
      return data.order.stagePlan;
    },
  });
  if (demo) return { data: demo.sections, isLoading: false, isError: false };
  return query;
}

/** The chain for one scope: a specific PO, or the whole order when poId is null. */
export function useProductionChain({
  orderId,
  purchaseOrders,
  poId,
}: {
  orderId: string | undefined;
  purchaseOrders: PurchaseOrder[];
  poId: string | null;
}): { chain: ProductionChain | null; bundle: ProductionBundle | undefined; isLoading: boolean; isError: boolean } {
  const stagesQuery = useOrderStagePlan(orderId);
  const bundleQuery = useProductionBundle(orderId);

  const chain = useMemo(() => {
    const sections = stagesQuery.data;
    const bundle = bundleQuery.data;
    if (!sections || !bundle) return null;

    const scopedPos = poId ? purchaseOrders.filter((p) => p.id === poId) : purchaseOrders;
    const scopedPoIds = new Set(scopedPos.map((p) => p.id));

    const sizes = poId
      ? effectiveSizes(scopedPos[0], bundle.sizes.filter((s) => s.poId === poId))
      : mergeSizesAcrossPos(purchaseOrders, bundle.sizes);

    const totalPcs = sizes.reduce((total, s) => total + s.quantity, 0);

    return buildProductionChain({
      sections,
      totalPcs,
      sizes,
      lots: bundle.lots.filter((l) => !poId || !l.poId || l.poId === poId),
      requirements: bundle.requirements.filter((r) => !poId || !r.poId || r.poId === poId),
      materialEntries: bundle.materialEntries,
      txns: bundle.txns.filter((t) => (poId ? t.poId === poId : !t.poId || scopedPoIds.has(t.poId))),
    });
  }, [stagesQuery.data, bundleQuery.data, poId, purchaseOrders]);

  return {
    chain,
    bundle: bundleQuery.data,
    isLoading: stagesQuery.isLoading || bundleQuery.isLoading,
    isError: stagesQuery.isError || bundleQuery.isError,
  };
}

/** The order's POs on their own - stage forms are handed an assignment, not
 *  an order bundle, so they need to resolve the PO list themselves. */
export function useOrderPurchaseOrders(orderId: string | undefined) {
  const demo = useDemoStore();
  const query = useQuery({
    queryKey: ["order_pos", orderId],
    enabled: !!orderId && !demo,
    queryFn: async (): Promise<PurchaseOrder[]> => {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the order.");
      return data.order.purchaseOrders;
    },
  });
  if (demo) return { data: demo.purchaseOrders, isLoading: false, isError: false };
  return query;
}

/** Everything one stage form needs: its own link in the chain, the lots it
 *  can pick from, and the size breakdown it measures against. */
export function useStageChain(orderId: string | undefined, poId: string | null, sectionId: string | undefined) {
  const posQuery = useOrderPurchaseOrders(orderId);
  const purchaseOrders = posQuery.data ?? [];
  const { chain, bundle, isLoading, isError } = useProductionChain({ orderId, purchaseOrders, poId });

  const cs = useMemo(() => chain?.stages.find((s) => s.stage.id === sectionId) ?? null, [chain, sectionId]);
  const lots = useMemo(() => (chain?.lots ?? []).slice().sort((a, b) => a.lotNo.localeCompare(b.lotNo)), [chain]);

  return {
    chain,
    cs,
    lots,
    sizes: chain?.sizes ?? [],
    requirements: bundle?.requirements ?? [],
    materialEntries: bundle?.materialEntries ?? [],
    accessoryRequirements: bundle?.accessoryRequirements ?? [],
    accessoryEntries: bundle?.accessoryEntries ?? [],
    purchaseOrders,
    isLoading: posQuery.isLoading || isLoading,
    isError: posQuery.isError || isError,
  };
}

function mergeSizesAcrossPos(
  purchaseOrders: PurchaseOrder[],
  allSizes: PoSizeQuantity[],
): { sizeCode: string; quantity: number }[] {
  const totals = new Map<string, number>();
  const order: string[] = [];
  for (const po of purchaseOrders) {
    const rows = effectiveSizes(po, sortSizes(allSizes.filter((s) => s.poId === po.id)));
    for (const r of rows) {
      if (!totals.has(r.sizeCode)) order.push(r.sizeCode);
      totals.set(r.sizeCode, (totals.get(r.sizeCode) ?? 0) + r.quantity);
    }
  }
  return order.map((code) => ({ sizeCode: code, quantity: totals.get(code) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Mutations - every write invalidates the chain, the order detail, the audit
// log and my_work so the stage the user is on, the stages after it, and the
// dashboards all refresh from the same fetch.
// ---------------------------------------------------------------------------

function invalidateChain(queryClient: ReturnType<typeof useQueryClient>, orderId: string) {
  queryClient.invalidateQueries({ queryKey: [KEY] });
  queryClient.invalidateQueries({ queryKey: ["order_detail", orderId] });
  queryClient.invalidateQueries({ queryKey: ["audit_log"] });
  queryClient.invalidateQueries({ queryKey: ["my_work_entries"] });
  queryClient.invalidateQueries({ queryKey: ["orders_bundle"] });
}

export type NewTxn = Omit<ProductionTxn, "id" | "createdAt" | "updatedAt" | "updatedBy">;

export function useCreateTxns() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async (rows: NewTxn[]) => {
      const usable = rows.filter((r) => r.qtyIn || r.qtyOut || r.qtyRejected || r.qtyRework);
      if (usable.length === 0) return [] as ProductionTxn[];
      if (demo) return demo.addTxns(usable);
      return (await jsonFetch<{ txns: ProductionTxn[] }>("/api/production-txns", {
        method: "POST",
        body: JSON.stringify({ rows: usable }),
      })).txns;
    },
    onSuccess: (_d, rows) => {
      if (demo || !rows[0]) return;
      invalidateChain(queryClient, rows[0].orderId);
    },
  });
}

export function useUpdateTxn() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async ({ id, orderId: _orderId, patch }: { id: string; orderId: string; patch: Partial<ProductionTxn> }) => {
      if (demo) return demo.patchTxn(id, patch);
      return jsonFetch(`/api/production-txns/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

export function useCreateLot() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async (input: { orderId: string; poId: string | null; lotNo: string; fabricType?: string | null; notes?: string | null }) => {
      if (demo) return demo.addLot(input);
      return (await jsonFetch<{ lot: ProductionLot }>("/api/production-lots", { method: "POST", body: JSON.stringify(input) })).lot;
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

export function useDeleteLot() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async ({ id, orderId: _orderId }: { id: string; orderId: string }) => {
      if (demo) return demo.removeLot(id);
      return jsonFetch(`/api/production-lots/${id}`, { method: "DELETE" });
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

export type NewRequirement = Omit<MaterialRequirement, "id" | "createdAt" | "updatedAt" | "updatedBy">;

export function useSaveRequirement() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<NewRequirement> & { orderId: string } }) => {
      if (demo) return demo.saveRequirement(id, input);
      if (id) return jsonFetch(`/api/material-requirements/${id}`, { method: "PATCH", body: JSON.stringify(input) });
      return jsonFetch("/api/material-requirements", { method: "POST", body: JSON.stringify(input) });
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.input.orderId);
    },
  });
}

export function useDeleteRequirement() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async ({ id, orderId: _orderId }: { id: string; orderId: string }) => {
      if (demo) return demo.removeRequirement(id);
      return jsonFetch(`/api/material-requirements/${id}`, { method: "DELETE" });
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

export type NewMaterialEntry = Omit<MaterialEntry, "id" | "createdAt" | "updatedAt" | "updatedBy">;

export function useSaveMaterialEntry() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<NewMaterialEntry>; orderId: string }) => {
      if (demo) return demo.saveMaterialEntry(id, input);
      if (id) return jsonFetch(`/api/material-entries/${id}`, { method: "PATCH", body: JSON.stringify(input) });
      return jsonFetch("/api/material-entries", { method: "POST", body: JSON.stringify(input) });
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

export function useDeleteMaterialEntry() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async ({ id, orderId: _orderId }: { id: string; orderId: string }) => {
      if (demo) return demo.removeMaterialEntry(id);
      return jsonFetch(`/api/material-entries/${id}`, { method: "DELETE" });
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

// ---------------------------------------------------------------------------
// Accessories - POST-only, no update/delete mutation exists for either model
// (see prisma/schema.prisma's Accessories module comment and
// src/app/api/accessory-requirements|entries/route.ts).
// ---------------------------------------------------------------------------

export type NewAccessoryRequirement = Omit<AccessoryRequirement, "id" | "createdAt">;

export function useSaveAccessoryRequirement() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async (input: NewAccessoryRequirement) => {
      if (demo) return demo.addAccessoryRequirement(input);
      return (await jsonFetch<{ requirement: AccessoryRequirement }>("/api/accessory-requirements", {
        method: "POST",
        body: JSON.stringify(input),
      })).requirement;
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

export type NewAccessoryEntry = Omit<AccessoryEntry, "id" | "createdAt" | "enteredBy"> & { orderId: string };

export function useSaveAccessoryEntry() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async ({ orderId: _orderId, ...input }: NewAccessoryEntry) => {
      if (demo) return demo.addAccessoryEntry(input);
      return (await jsonFetch<{ entry: AccessoryEntry }>("/api/accessory-entries", {
        method: "POST",
        body: JSON.stringify(input),
      })).entry;
    },
    onSuccess: (_d, v) => {
      if (demo) return;
      invalidateChain(queryClient, v.orderId);
    },
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type NewAuditRow = Omit<AuditLogRow, "id" | "createdAt" | "userId">;

export function useAuditLog(orderId: string | undefined, entityId?: string) {
  const demo = useDemoStore();
  const query = useQuery({
    queryKey: ["audit_log", orderId, entityId],
    enabled: !!orderId && !demo,
    queryFn: async () =>
      (await jsonFetch<{ auditLog: AuditLogRow[] }>(
        `/api/audit-log?orderId=${orderId}${entityId ? `&entityId=${entityId}` : ""}`,
      )).auditLog,
  });
  // The sandbox keeps no audit trail of its own - practice entries aren't
  // history worth showing, and useRecordAudit below swallows them anyway.
  if (demo) return { data: [] as AuditLogRow[], isLoading: false, isError: false };
  return query;
}

/** Audit failures are swallowed deliberately: losing the history of a saved
 *  quantity is bad, but rolling back a floor operator's genuine production
 *  entry because the log write failed is worse. */
export function useRecordAudit() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: async (row: NewAuditRow) => {
      if (demo) return;
      try {
        await jsonFetch("/api/audit-log", { method: "POST", body: JSON.stringify(row) });
      } catch (error) {
        console.warn("Audit log write failed:", error);
      }
    },
    onSuccess: () => {
      if (demo) return;
      queryClient.invalidateQueries({ queryKey: ["audit_log"] });
    },
  });
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    const prev = before[key as keyof T];
    if (prev !== next && !(prev == null && next == null)) changes[key] = { from: prev, to: next };
  }
  return Object.keys(changes).length ? changes : null;
}
