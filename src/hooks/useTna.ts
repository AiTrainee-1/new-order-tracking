"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TnaEventRow, TnaRecord } from "@/lib/tna";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

/**
 * The current time, re-read on an interval. TNA statuses are a function of
 * "now" - "due in 5h" becomes "overdue by 1h" with nobody doing anything - so
 * anything that shows one re-renders on this tick instead of waiting for a
 * refetch.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Every TNA schedule across all orders (Admin and MD). */
export function useTnaOverview() {
  return useQuery({
    queryKey: ["tna_overview"],
    queryFn: async () => (await jsonFetch<{ records: TnaRecord[] }>("/api/tna")).records,
    // Actuals move as the floor records work, so keep it reasonably fresh.
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export interface OrderTna {
  records: TnaRecord[];
  events: TnaEventRow[];
}

/** One order's schedules, actuals and history - what its workflow shows. */
export function useOrderTna(orderId: string | undefined | null) {
  return useQuery({
    queryKey: ["tna_order", orderId],
    enabled: !!orderId,
    queryFn: () => jsonFetch<OrderTna>(`/api/tna/orders/${orderId}`),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export interface SaveTnaStage {
  sectionId: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  graceMinutes?: number;
  notes?: string | null;
}

/** Save an order's TNA (assign / change / clear) in one all-or-nothing request. */
export function useSaveOrderTna() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, stages }: { orderId: string; stages: SaveTnaStage[] }) =>
      jsonFetch<OrderTna>(`/api/tna/orders/${orderId}`, { method: "PUT", body: JSON.stringify({ stages }) }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["tna_order", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["tna_overview"] });
      queryClient.invalidateQueries({ queryKey: ["tna_alerts"] });
    },
  });
}

export interface TnaAlerts {
  critical: number;
  grace: number;
  dueSoon: number;
  lateStart: number;
  attention: number;
}

/** The numbers behind the sidebar badge. Off unless `enabled`. */
export function useTnaAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["tna_alerts"],
    enabled,
    queryFn: () => jsonFetch<TnaAlerts>("/api/tna/alerts"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
}
