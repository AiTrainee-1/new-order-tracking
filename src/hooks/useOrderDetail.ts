"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUsers } from "./useUsers";
import { buildOrderProgress, type OrderProgress } from "@/lib/progress";
import { getCombinedCutQuantity } from "@/lib/orderQty";
import type { ChainSection, Order, PoSizeQuantity, PublicAppUser, PurchaseOrder, StageEntry } from "@/lib/types";

export interface OrderDetailData extends Order {
  purchaseOrders: (PurchaseOrder & { sizeQuantities: PoSizeQuantity[] })[];
  stagePlan: ChainSection[];
}

async function fetchOrder(orderId: string): Promise<OrderDetailData> {
  const res = await fetch(`/api/orders/${orderId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load this order.");
  return data.order;
}

async function fetchEntries(orderId: string): Promise<StageEntry[]> {
  const res = await fetch(`/api/stage-entries?orderId=${orderId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load stage entries.");
  return data.entries;
}

/**
 * The "order detail bundle": order + purchase orders + this order's own
 * stage plan + stage_entries (drives gating/progress) + every user (drives
 * name resolution anywhere on the page). Deliberately does NOT include the
 * quantity-layer ledgers (production_txns/lots/materials) - that's a
 * separate fetch via useProductionChain, exactly like the old app, since
 * OrderDetailPage needs both independently.
 */
export function useOrderDetail(orderId: string | undefined) {
  const dataQuery = useQuery({
    queryKey: ["order_detail", orderId],
    enabled: !!orderId,
    queryFn: () => fetchOrder(orderId!),
  });

  const entriesQuery = useQuery({
    queryKey: ["order_stage_entries", orderId],
    enabled: !!orderId,
    queryFn: () => fetchEntries(orderId!),
  });

  const usersQuery = useUsers();

  const usersById = useMemo(() => {
    const map = new Map<string, PublicAppUser>();
    for (const u of usersQuery.data ?? []) map.set(u.id, u);
    return map;
  }, [usersQuery.data]);

  const order = dataQuery.data;
  const purchaseOrders = order?.purchaseOrders ?? [];
  const entries = useMemo(() => [...(entriesQuery.data ?? [])].sort((a, b) => a.entryDate.localeCompare(b.entryDate)), [entriesQuery.data]);

  const progress: OrderProgress | null = useMemo(() => {
    if (!order) return null;
    const qtyBaseline = { totalQty: order.totalQty, cutQuantity: getCombinedCutQuantity(order, purchaseOrders) };
    return buildOrderProgress(order, order.stagePlan, entries, qtyBaseline);
  }, [order, purchaseOrders, entries]);

  return {
    order,
    purchaseOrders,
    stagePlan: order?.stagePlan ?? [],
    entries,
    usersById,
    progress,
    isLoading: dataQuery.isLoading || entriesQuery.isLoading || usersQuery.isLoading,
    isError: dataQuery.isError || entriesQuery.isError,
    refetch: dataQuery.refetch,
  };
}
