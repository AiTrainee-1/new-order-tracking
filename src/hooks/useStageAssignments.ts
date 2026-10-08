"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StageAssignment } from "@/lib/types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

/** Global per-stage defaults - no joins, deliberately (mirrors the old
 *  app's own reasoning: consumers resolve the user/stage via useUsers()/
 *  useStageDefinitions() so this stays a plain, cheap list). */
export function useStageAssignments() {
  return useQuery({
    queryKey: ["stage_assignments"],
    queryFn: async () =>
      (await jsonFetch<{ stageAssignments: StageAssignment[] }>("/api/stage-assignments")).stageAssignments,
  });
}

export interface UpsertStageAssignmentInput {
  userId: string;
  stageDefinitionId: string;
  canEnterData: boolean;
}

export function useUpsertStageAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertStageAssignmentInput) =>
      jsonFetch("/api/stage-assignments", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stage_assignments"] }),
  });
}

export interface BulkAssignResult {
  /** How many stages were asked for (every active stage, for "Assign All"). */
  requested: number;
  /** Newly assigned. */
  created: number;
  /** Already assigned, but their access level was brought in line. */
  updated: number;
  /** Already assigned exactly as asked. */
  unchanged: number;
  /** Stages the user is now on, out of `requested` - the server checks this equals it. */
  total: number;
}

/** Assign one user to many stages in ONE all-or-nothing request (see
 *  /api/stage-assignments/bulk). Leave `stageDefinitionIds` out for "every
 *  active stage" - the server resolves that, so a stale catalog in the browser
 *  can't cause a stage to be skipped. */
export function useBulkAssignStages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; canEnterData: boolean; stageDefinitionIds?: string[] }) =>
      jsonFetch<BulkAssignResult>("/api/stage-assignments/bulk", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stage_assignments"] }),
  });
}

export function useDeleteStageAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jsonFetch(`/api/stage-assignments/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stage_assignments"] }),
  });
}
