"use client";

import { useQuery } from "@tanstack/react-query";
import type { AccessoryEntry, AccessoryRequirement } from "@/lib/types";

/** One row from GET /api/accessories-summary - a requirement with its order/PO
 *  context and every entry against it, for the cross-order Accessories
 *  Management page (admin/MD only, see that route's own comment). */
export interface AccessorySummaryRow extends AccessoryRequirement {
  order: { id: string; ioNo: string; style: string; color: string | null; buyer: { id: string; name: string } | null };
  po: { id: string; poNumber: string } | null;
  entries: AccessoryEntry[];
}

export function useAccessoriesSummary() {
  return useQuery({
    queryKey: ["accessories_summary"],
    queryFn: async (): Promise<AccessorySummaryRow[]> => {
      const res = await fetch("/api/accessories-summary");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the accessories summary.");
      return data.requirements;
    },
  });
}
