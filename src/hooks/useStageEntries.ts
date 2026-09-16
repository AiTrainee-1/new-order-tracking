"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDemoStore } from "@/context/DemoModeContext";
import type { StageEntry } from "@/lib/types";

/**
 * Demo mode (the Preview sandbox on Stage Roles) is guarded here, at the
 * fetch: inside a DemoModeProvider every hook below serves the in-memory demo
 * store and no request is issued. See src/context/DemoModeContext.tsx.
 */

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export function useRecentStageEntries(orderId?: string, sectionId?: string) {
  const demo = useDemoStore();
  const query = useQuery({
    queryKey: ["stage_entries", orderId, sectionId],
    enabled: !!orderId && !!sectionId && !demo,
    queryFn: async () =>
      (await jsonFetch<{ entries: StageEntry[] }>(`/api/stage-entries?orderId=${orderId}&sectionId=${sectionId}`)).entries,
  });
  if (demo) {
    return { data: demo.stageEntries.filter((e) => e.sectionId === sectionId), isLoading: false, isError: false };
  }
  return query;
}

export type CreateStageEntryInput = Omit<StageEntry, "id" | "createdAt" | "enteredBy">;

function invalidateAfterEntry(queryClient: ReturnType<typeof useQueryClient>, orderId: string, sectionId: string) {
  queryClient.invalidateQueries({ queryKey: ["stage_entries", orderId, sectionId] });
  queryClient.invalidateQueries({ queryKey: ["order_detail", orderId] });
  queryClient.invalidateQueries({ queryKey: ["orders_bundle"] });
  queryClient.invalidateQueries({ queryKey: ["my_work_entries"] });
}

export function useCreateStageEntry() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: (input: CreateStageEntryInput) => {
      if (demo) {
        demo.addStageEntry(input);
        return Promise.resolve();
      }
      return jsonFetch("/api/stage-entries", { method: "POST", body: JSON.stringify({ entry: input }) });
    },
    onSuccess: (_data, variables) => {
      if (demo) return;
      invalidateAfterEntry(queryClient, variables.orderId, variables.sectionId);
    },
  });
}

export function useCreateStageEntries() {
  const queryClient = useQueryClient();
  const demo = useDemoStore();
  return useMutation({
    mutationFn: (inputs: CreateStageEntryInput[]) => {
      if (inputs.length === 0) return Promise.resolve();
      if (demo) {
        for (const input of inputs) demo.addStageEntry(input);
        return Promise.resolve();
      }
      return jsonFetch("/api/stage-entries", { method: "POST", body: JSON.stringify({ entries: inputs }) });
    },
    onSuccess: (_data, variables) => {
      if (demo || variables.length === 0) return;
      invalidateAfterEntry(queryClient, variables[0].orderId, variables[0].sectionId);
    },
  });
}
