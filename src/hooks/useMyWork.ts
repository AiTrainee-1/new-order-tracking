"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAssignments } from "./useAssignments";
import { useStageAssignments } from "./useStageAssignments";
import { useOrdersList, type OrderListRow } from "./useOrdersList";
import { buildOrderProgress, type OrderProgress, type StageProgress } from "@/lib/progress";
import { getOrderProductionQty } from "@/lib/orderQty";
import type { AssignmentWithDetails, Order, StageEntry } from "@/lib/types";

export type GateStatus = "active" | "locked" | "completed";

export interface WorkItem {
  assignment: AssignmentWithDetails;
  stageProgress: StageProgress | undefined;
  orderProgress: OrderProgress;
  overallProgressPct: number;
  gateStatus: GateStatus;
  /** True when this item comes from a global stage-role default, not an
   *  explicit per-order assignment. */
  isDefault: boolean;
}

export interface WorkBadge {
  tone: "good" | "warn" | "info" | "neutral";
  label: string;
}

/** Orange is reserved for exactly one meaning across the whole app - "moved
 *  on but not finished, a balance is still owed here" - so it outranks the
 *  gate status. */
export function workBadge(item: WorkItem): WorkBadge {
  if (item.stageProgress?.isPartial) return { tone: "warn", label: "Not Complete" };
  if (item.gateStatus === "completed") return { tone: "good", label: "Completed" };
  if (item.gateStatus === "locked") return { tone: "neutral", label: "Waiting" };
  return { tone: "info", label: "Your Turn" };
}

/** Every work item is scoped to (order, section), never (order, PO,
 *  section) - data entry is order-wide, never split by PO. */
function toOrderWide<T extends { poId: string | null; po?: AssignmentWithDetails["po"] }>(base: T): T {
  if (!base.poId) return base;
  return { ...base, poId: null, po: null };
}

export function useMyWork(userId: string | undefined) {
  const assignmentsQuery = useAssignments(userId);
  const stageDefaultsQuery = useStageAssignments();
  const ordersQuery = useOrdersList({ includeStagePlan: true });

  const orders = ordersQuery.data ?? [];
  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  // Effective assignments = explicit per-order rows PLUS global stage-role
  // defaults expanded against every order whose OWN stage plan happens to
  // include that catalog stage (a default is meaningless for an order that
  // doesn't include the stage at all - see StageAssignment's schema comment).
  const effectiveAssignments = useMemo<AssignmentWithDetails[]>(() => {
    const explicitBase = (assignmentsQuery.data ?? []).filter((a) => !!a.order);
    const seen = new Set<string>();
    const explicit: AssignmentWithDetails[] = [];
    for (const a of explicitBase) {
      const wide = toOrderWide(a);
      const key = `${wide.orderId}::${wide.sectionId}::${wide.unitName ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      explicit.push(wide);
    }
    if (!userId) return explicit;

    const myDefaults = (stageDefaultsQuery.data ?? []).filter((sa) => sa.userId === userId);
    const explicitKeys = new Set(explicit.map((a) => `${a.orderId}::${a.sectionId}`));

    const synthetic: AssignmentWithDetails[] = [];
    for (const order of orders as OrderListRow[]) {
      for (const section of order.stagePlan ?? []) {
        const def = myDefaults.find((sa) => sa.stageDefinitionId === section.stageDefinitionId);
        if (!def) continue;
        const key = `${order.id}::${section.id}`;
        if (explicitKeys.has(key)) continue;
        synthetic.push({
          id: `default:${def.id}:${order.id}`,
          userId,
          orderId: order.id,
          poId: null,
          sectionId: section.id,
          unitName: null,
          canEnterData: def.canEnterData,
          createdAt: def.createdAt,
          order: order as Order,
          po: null,
          section,
          user: { id: userId, name: "", username: "", phone: null },
        });
      }
    }
    return [...explicit, ...synthetic];
  }, [assignmentsQuery.data, stageDefaultsQuery.data, orders, userId]);

  const orderIds = useMemo(() => Array.from(new Set(effectiveAssignments.map((a) => a.orderId))), [effectiveAssignments]);

  const entriesQuery = useQuery({
    queryKey: ["my_work_entries", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async (): Promise<StageEntry[]> => {
      const res = await fetch(`/api/stage-entries?orderIds=${orderIds.join(",")}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load stage entries.");
      return data.entries;
    },
  });

  const workItems: WorkItem[] = useMemo(() => {
    const entries = entriesQuery.data ?? [];

    return effectiveAssignments.map((a) => {
      const orderEntries = entries.filter((e) => e.orderId === a.orderId);
      const fullOrder = ordersById.get(a.orderId);
      const productionQty = getOrderProductionQty(fullOrder?.purchaseOrders ?? []);
      const order = a.order as Order;
      const qtyBaseline = { totalQty: productionQty || order.totalQty, cutQuantity: order.cutQuantity };
      const orderProgress = buildOrderProgress(order, fullOrder?.stagePlan ?? [], orderEntries, qtyBaseline);
      const stageProgress = orderProgress.stages.find((s) => s.stage.id === a.sectionId);

      let gateStatus: GateStatus;
      if (stageProgress?.isCompleted) gateStatus = "completed";
      else if (stageProgress?.isUnlocked) gateStatus = "active";
      else gateStatus = "locked";

      return {
        assignment: a,
        stageProgress,
        orderProgress,
        overallProgressPct: orderProgress.overallProgressPct,
        gateStatus,
        isDefault: a.id.startsWith("default:"),
      };
    });
  }, [effectiveAssignments, entriesQuery.data, ordersById]);

  return {
    workItems,
    isLoading: assignmentsQuery.isLoading || stageDefaultsQuery.isLoading || ordersQuery.isLoading || entriesQuery.isLoading,
    isError: assignmentsQuery.isError || stageDefaultsQuery.isError || ordersQuery.isError || entriesQuery.isError,
  };
}
