"use client";

import { useQuery } from "@tanstack/react-query";
import { resolveRange, type ActivityResponse, type DateRange, type TrackingHistoryResponse, type TrackingOverview } from "@/lib/trackingHistory";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load Tracking History.");
  return data;
}

/** The Final Order Report's data: every order's own stages, lifetime status
 *  + entries inside [range]. Refetches on focus/mount so it's always current.
 *  `enabled` defaults to true (Tracking History wants it live); the Reports
 *  page passes false until its own explicit "Generate Report" click. */
export function useTrackingHistory(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: ["tracking_history", range.fromISO, range.toISO],
    queryFn: () => getJson<TrackingHistoryResponse>(`/api/tracking-history?from=${encodeURIComponent(range.fromISO)}&to=${encodeURIComponent(range.toISO)}`),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** The flat per-entry feed behind User-Wise, Stage/Order-Wise and the
 *  Detailed Activity Report - see lib/trackingActivity.ts for the groupings
 *  built on top of it. */
export function useTrackingActivity(range: DateRange) {
  return useQuery({
    queryKey: ["tracking_activity", range.fromISO, range.toISO],
    queryFn: () => getJson<ActivityResponse>(`/api/tracking-history/activity?from=${encodeURIComponent(range.fromISO)}&to=${encodeURIComponent(range.toISO)}`),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** Literal Today's and Yesterday's activity, independent of whatever range
 *  the report tabs are filtered to - powers both the dashboard KPI tiles and
 *  the Today vs Yesterday Comparison report. Recomputed from `Date.now()`
 *  on every call/refetch, not memoized across a stale "now". */
export function useTodayVsYesterdayActivity() {
  return useQuery({
    queryKey: ["tracking_today_vs_yesterday"],
    queryFn: async () => {
      const now = new Date();
      const today = resolveRange("today", { from: "", to: "" }, now);
      const yesterday = resolveRange("yesterday", { from: "", to: "" }, now);
      const [t, y] = await Promise.all([
        getJson<ActivityResponse>(`/api/tracking-history/activity?from=${encodeURIComponent(today.fromISO)}&to=${encodeURIComponent(today.toISO)}`),
        getJson<ActivityResponse>(`/api/tracking-history/activity?from=${encodeURIComponent(yesterday.fromISO)}&to=${encodeURIComponent(yesterday.toISO)}`),
      ]);
      return { today: t.records, yesterday: y.records };
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** The always-on Report Dashboard numbers (Today's/Yesterday's entries,
 *  active users, lifetime completed/pending stages) - independent of the
 *  report tabs' own date filter. */
export function useTrackingOverview() {
  return useQuery({
    queryKey: ["tracking_overview"],
    queryFn: () => {
      const now = new Date();
      const today = resolveRange("today", { from: "", to: "" }, now);
      const yesterday = resolveRange("yesterday", { from: "", to: "" }, now);
      const qs = new URLSearchParams({
        todayFrom: today.fromISO,
        todayTo: today.toISO,
        yesterdayFrom: yesterday.fromISO,
        yesterdayTo: yesterday.toISO,
      });
      return getJson<TrackingOverview>(`/api/tracking-history/overview?${qs.toString()}`);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
