"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OrderSummary } from "@/lib/orderSummary";

/**
 * Every order's production position, keyed by order id - fetched once for the
 * whole list rather than one request per card. Admin and MD only (the server
 * refuses anyone else, so don't call it from a floor user's page).
 */
export function useOrderSummaries(options?: { includeHidden?: boolean }) {
  const includeHidden = options?.includeHidden ?? false;
  const query = useQuery({
    queryKey: ["orders_summary", { includeHidden }],
    staleTime: 30_000,
    queryFn: async (): Promise<OrderSummary[]> => {
      const res = await fetch(`/api/orders-summary${includeHidden ? "?includeHidden=true" : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load the production summary.");
      return data.summaries;
    },
  });
  const byOrder = useMemo(() => new Map((query.data ?? []).map((s) => [s.orderId, s])), [query.data]);
  return { summaries: query.data ?? [], byOrder, isLoading: query.isLoading, isError: query.isError };
}
