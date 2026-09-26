"use client";

import { useQuery } from "@tanstack/react-query";
import type { TrackingHistoryResponse } from "@/lib/trackingHistory";

/** Admin-only: per-order, per-stage entry counts and status for a date range.
 *  Refetches on focus/mount so "Today" is always current when the admin
 *  comes back to the tab at the end of the day. */
export function useTrackingHistory(from: string, to: string) {
  return useQuery({
    queryKey: ["tracking_history", from, to],
    queryFn: async (): Promise<TrackingHistoryResponse> => {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(`/api/tracking-history?from=${from}&to=${to}&tzOffset=${tzOffset}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load Tracking History.");
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
