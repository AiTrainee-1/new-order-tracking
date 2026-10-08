"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/context/ToastContext";

/**
 * What the server reports when a write was mirrored onto other orders in an
 * Order Group (see lib/server/orderGroups.ts). Absent from every response for an
 * order that is not grouped.
 */
export interface GroupSyncInfo {
  groupName: string;
  alsoSavedTo?: { ioNo: string; style: string; color: string | null }[];
  alsoUpdated?: { ioNo: string; style: string; color: string | null }[];
  alsoRemoved?: { ioNo: string; style: string; color: string | null }[];
}

/** One line for a toast, e.g. 'Group "IO 338/26 · Printing": also saved to 2 other orders too (338/26 BLUE, 338/26 GREEN).' */
export function groupSyncMessage(sync: GroupSyncInfo): string | null {
  const [verb, orders] = sync.alsoSavedTo?.length
    ? (["also saved to", sync.alsoSavedTo] as const)
    : sync.alsoUpdated?.length
      ? (["correction also applied to", sync.alsoUpdated] as const)
      : sync.alsoRemoved?.length
        ? (["also removed from", sync.alsoRemoved] as const)
        : ([null, []] as const);
  if (!verb) return null;
  const names = orders.map((o) => `${o.ioNo} ${o.color ?? o.style}`).join(", ");
  return `Group "${sync.groupName}": ${verb} ${orders.length} other order${orders.length === 1 ? "" : "s"} too (${names}).`;
}

/**
 * Everything one order's pages cache that a group write can change on ANOTHER
 * order. The write hooks refresh the order the user is on; a group also wrote to
 * its siblings, and without this they would show the old figures until their
 * 30-second cache lapsed - so a record entered on one colour would look missing
 * on the next colour's page.
 */
const SIBLING_QUERIES = [
  "order_detail",
  "order_stage_entries",
  "production_chain",
  "audit_log",
  "orders_bundle_entries",
  "orders_list",
  "orders_summary",
  "my_work_entries",
  "accessories_summary",
  "stage_entries",
  "order_stage_plan",
  "order_pos",
  "order_groups",
  "group_totals",
];

/**
 * A fetch for the mutation hooks: the same JSON request as always, plus - only
 * when the server says the write also reached other orders in a group - a toast
 * naming them, so a grouped entry is never a silent surprise.
 */
export function useSyncedFetch() {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      const message = data?.groupSync ? groupSyncMessage(data.groupSync as GroupSyncInfo) : null;
      if (message) toast.show(message, "info");
      // The write reached other orders: refresh what THEY show, not just this one.
      if (data?.groupSync) queryClient.invalidateQueries({ predicate: (q) => SIBLING_QUERIES.includes(String(q.queryKey[0])) });
      return data as T;
    },
    [toast, queryClient],
  );
}
