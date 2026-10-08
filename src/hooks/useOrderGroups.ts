"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDemoStore } from "@/context/DemoModeContext";
import type { OrderGroupView } from "@/lib/orderGroups";
import type { GroupTotals } from "@/lib/groupTotals";

const KEY = "order_groups";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

/** Every order group - what the stage views read to show a group indicator and
 *  what the data-entry banner reads to say which orders an entry also reaches.
 *  Any signed-in user may read it; only an admin can change it. */
export function useOrderGroups() {
  // The Preview sandbox never reaches the server (see useProductionChain) - and
  // has no groups to show.
  const demo = useDemoStore();
  return useQuery({
    queryKey: [KEY],
    enabled: !demo,
    queryFn: async () => (await jsonFetch<{ groups: OrderGroupView[] }>("/api/order-groups")).groups,
    staleTime: 30_000,
  });
}

export interface OrderGroupInput {
  name?: string;
  orderIds: string[];
  stageKeys: string[];
}

/** Creates a group, or updates `id` when given. Admin-only on the server. */
export function useSaveOrderGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: OrderGroupInput }) => {
      const body = JSON.stringify(input);
      return (await (id
        ? jsonFetch<{ group: OrderGroupView }>(`/api/order-groups/${id}`, { method: "PATCH", body })
        : jsonFetch<{ group: OrderGroupView }>("/api/order-groups", { method: "POST", body }))).group;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteOrderGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => jsonFetch(`/api/order-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

/**
 * The group-level totals (each member's own figures per stage, and their sum).
 * Computed fresh by the server from the group's CURRENT links - so a dissolved
 * group has none, and an entry made on any member shows up here at once. Only
 * fetched once something asks for it (`enabled`), since it reads every member's
 * records.
 */
export function useGroupTotals(groupId: string | null | undefined, enabled = true) {
  const demo = useDemoStore();
  return useQuery({
    queryKey: ["group_totals", groupId],
    enabled: !!groupId && enabled && !demo,
    staleTime: 10_000,
    queryFn: async () => (await jsonFetch<{ totals: GroupTotals }>(`/api/order-groups/${groupId}/totals`)).totals,
  });
}
