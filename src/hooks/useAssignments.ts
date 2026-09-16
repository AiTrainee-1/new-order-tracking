"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssignmentWithDetails } from "@/lib/types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

/** All per-order/PO/section grants, or just one user's - matches the old
 *  app's `["user_assignments", userId ?? "all"]` query key shape so the
 *  create/delete mutations' broad invalidation below still catches both. */
export function useAssignments(userId?: string) {
  return useQuery({
    queryKey: ["user_assignments", userId ?? "all"],
    queryFn: async () =>
      (await jsonFetch<{ assignments: AssignmentWithDetails[] }>(
        `/api/assignments${userId ? `?userId=${userId}` : ""}`,
      )).assignments,
  });
}

/** One order's full assignment roster - who's on which section, used to show
 *  who's scheduled to run the NEXT stage on OrderDetailPage. */
export function useOrderAssignments(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order_assignments", orderId],
    enabled: !!orderId,
    queryFn: async () => (await jsonFetch<{ assignments: AssignmentWithDetails[] }>(`/api/assignments?orderId=${orderId}`)).assignments,
  });
}

export interface CreateAssignmentInput {
  userId: string;
  orderId: string;
  poId: string | null;
  sectionId: string;
  unitName: string | null;
  canEnterData: boolean;
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssignmentInput) =>
      jsonFetch("/api/assignments", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_assignments"] }),
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jsonFetch(`/api/assignments/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_assignments"] }),
  });
}
