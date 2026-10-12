"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChainSection, Order, PurchaseOrder } from "@/lib/types";

export interface OrderListRow extends Order {
  purchaseOrders: PurchaseOrder[];
  stagePlan?: ChainSection[];
}

/** `mine` limits the list to the signed-in person's own work (assigned orders, and orders with a stage they hold a role for). */
export function useOrdersList(options?: { includeHidden?: boolean; includeStagePlan?: boolean; mine?: boolean }) {
  const includeHidden = options?.includeHidden ?? false;
  const includeStagePlan = options?.includeStagePlan ?? false;
  const mine = options?.mine ?? false;
  return useQuery({
    queryKey: ["orders_list", { includeHidden, includeStagePlan, mine }],
    queryFn: async (): Promise<OrderListRow[]> => {
      const params = new URLSearchParams();
      if (includeHidden) params.set("includeHidden", "true");
      if (includeStagePlan) params.set("includeStagePlan", "true");
      if (mine) params.set("mine", "true");
      const qs = params.toString();
      const res = await fetch(`/api/orders${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Could not load orders.");
      const data = await res.json();
      return data.orders;
    },
  });
}
