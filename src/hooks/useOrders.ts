"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildOrderProgress, type OrderProgress } from "@/lib/progress";
import { getCombinedCutQuantity } from "@/lib/orderQty";
import { useOrdersList } from "./useOrdersList";
import type { ChainSection, Order, PurchaseOrder, StageEntry } from "@/lib/types";

export interface OrderBundle {
  order: Order;
  purchaseOrders: PurchaseOrder[];
  progress: OrderProgress;
}

/** Fetches every non-hidden order (with its own stage plan) + every
 *  stage_entry for them, and builds an OrderProgress per order for the
 *  fleet dashboard - fully client-side, no server-side aggregation, same
 *  architecture as the old app's useAllOrderProgress(). */
export function useAllOrderProgress() {
  const ordersQuery = useOrdersList({ includeStagePlan: true });
  const orders = ordersQuery.data ?? [];
  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);

  const entriesQuery = useQuery({
    queryKey: ["orders_bundle_entries", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async (): Promise<StageEntry[]> => {
      const res = await fetch(`/api/stage-entries?orderIds=${orderIds.join(",")}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load stage entries.");
      return data.entries;
    },
  });

  const bundles: OrderBundle[] = useMemo(() => {
    if (!entriesQuery.data) return [];
    return orders.map((order) => {
      const orderEntries = entriesQuery.data!.filter((e) => e.orderId === order.id);
      const qtyBaseline = {
        totalQty: order.totalQty,
        cutQuantity: getCombinedCutQuantity(order, order.purchaseOrders),
      };
      const progress = buildOrderProgress(order, (order.stagePlan ?? []) as ChainSection[], orderEntries, qtyBaseline);
      return { order, purchaseOrders: order.purchaseOrders, progress };
    });
  }, [orders, entriesQuery.data]);

  return {
    bundles,
    isLoading: ordersQuery.isLoading || entriesQuery.isLoading,
    isError: ordersQuery.isError || entriesQuery.isError,
    refetch: entriesQuery.refetch,
  };
}
