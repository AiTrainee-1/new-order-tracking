"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import { useTrackingActivity, useTrackingHistory, useTrackingOverview, useTodayVsYesterdayActivity } from "@/hooks/useTrackingHistory";
import { useToast } from "@/context/ToastContext";
import { resolveRange, rangeLabel, type DatePreset } from "@/lib/trackingHistory";
import { applyActivityFilters, buildComparison, buildOrderSummaries, buildStageSummaries, buildUserSummaries, withUserSequence } from "@/lib/trackingActivity";
import { exportTrackingReport, type ExportRequest } from "@/lib/trackingHistoryExport";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { PageHero } from "@/components/ui/SectionCard";
import { Tabs } from "@/components/ui/Tabs";
import { ReportDashboard } from "./ReportDashboard";
import { DateRangeControl, type CustomRangeInput } from "./DateRangeControl";
import { ActivityFilters, EMPTY_ACTIVITY_FILTERS, applyFilters, describeActivityFilters, type ActivityFilterState } from "./ActivityFilters";
import { ExportBar } from "./ExportBar";
import { REPORT_TYPES, type ReportType } from "./reportTypes";
import { FinalOrderPanel, EMPTY_FINAL_ORDER_FILTERS, applyFinalOrderFilters, finalOrderDescribeFilters, type FinalOrderFilterState } from "./panels/FinalOrderPanel";
import { SummaryTablePanel, dateTimeCell } from "./panels/SummaryTablePanel";
import { ActivityPanel } from "./panels/ActivityPanel";
import { ComparisonPanel } from "./panels/ComparisonPanel";

/**
 * Tracking History - the admin's daily (or any-range) check on data entry.
 * Six report types over two data sources that share one canonical notion of
 * "an entry" (see src/lib/server/trackingActivity.ts):
 *   - Final Order Report: per-order, per-stage lifetime status + range count
 *   - User/Stage/Order-Wise and Detailed Activity: groupings of the same
 *     flat activity feed (src/lib/trackingActivity.ts)
 *   - Today vs Yesterday: the same feed, always the literal two days
 * The dashboard KPI strip is always-on and independent of the active tab;
 * the Export control can pull any report type's current, filtered data in
 * PNG or Excel regardless of which tab is on screen.
 */
export function TrackingHistoryView() {
  const toast = useToast();
  // The period, report tab and every filter are kept for the life of the browser
  // tab, so drilling into an order and coming back lands on the same report.
  const { appUser } = useAuth();
  const who = appUser?.id ?? "anon";
  const [preset, setPreset] = usePersistedState<DatePreset>(`ot:tracking:${who}:preset`, "today");
  const [custom, setCustom] = usePersistedState<CustomRangeInput>(`ot:tracking:${who}:custom`, { from: "", to: "" });
  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);

  const [tab, setTab] = usePersistedState<ReportType>(`ot:tracking:${who}:tab`, "finalOrder", (v) => REPORT_TYPES.some((t) => t.key === v));
  const [activityFilters, setActivityFilters] = usePersistedState<ActivityFilterState>(`ot:tracking:${who}:activity`, EMPTY_ACTIVITY_FILTERS);
  const [finalOrderFilters, setFinalOrderFilters] = usePersistedState<FinalOrderFilterState>(`ot:tracking:${who}:final`, EMPTY_FINAL_ORDER_FILTERS);
  const [exporting, setExporting] = useState<"png" | "excel" | null>(null);

  const overview = useTrackingOverview();
  const finalOrder = useTrackingHistory(range);
  const activity = useTrackingActivity(range);
  const comparisonData = useTodayVsYesterdayActivity();

  const allRecords = useMemo(() => activity.data?.records ?? [], [activity.data]);
  const filteredRecords = useMemo(() => applyFilters(allRecords, activityFilters), [allRecords, activityFilters]);
  const filterSummary = useMemo(() => describeActivityFilters(activityFilters, allRecords), [activityFilters, allRecords]);
  const sequencedRecords = useMemo(() => withUserSequence(filteredRecords), [filteredRecords]);
  const userSummaries = useMemo(() => buildUserSummaries(filteredRecords), [filteredRecords]);
  const stageSummaries = useMemo(() => buildStageSummaries(filteredRecords), [filteredRecords]);
  const orderSummaries = useMemo(() => buildOrderSummaries(filteredRecords), [filteredRecords]);

  const comparison = useMemo(() => {
    if (!comparisonData.data) return null;
    return buildComparison(applyActivityFilters(comparisonData.data.today, activityFilters), applyActivityFilters(comparisonData.data.yesterday, activityFilters));
  }, [comparisonData.data, activityFilters]);

  const finalOrders = useMemo(() => finalOrder.data?.orders ?? [], [finalOrder.data]);
  const visibleFinalOrders = useMemo(() => applyFinalOrderFilters(finalOrders, finalOrderFilters), [finalOrders, finalOrderFilters]);

  function drillInto(patch: Partial<ActivityFilterState>) {
    setActivityFilters({ ...EMPTY_ACTIVITY_FILTERS, ...patch });
    setTab("activity");
  }

  function buildExportRequest(type: ReportType): ExportRequest {
    const meta = { range: type === "comparison" ? undefined : range, filterSummary: type === "finalOrder" ? finalOrderDescribeFilters(finalOrderFilters) : filterSummary };
    switch (type) {
      case "finalOrder":
        return { type, orders: visibleFinalOrders, meta };
      case "userWise":
        return { type, users: userSummaries, meta };
      case "stageWise":
        return { type, stages: stageSummaries, meta };
      case "orderWise":
        return { type, orders: orderSummaries, meta };
      case "activity":
        return { type, records: sequencedRecords, meta };
      case "comparison":
        return { type, comparison: comparison ?? { totals: { today: 0, yesterday: 0, diff: 0 }, orders: { today: 0, yesterday: 0, diff: 0 }, byUser: [], byStage: [], byOrder: [] }, meta };
    }
  }

  async function handleExport(type: ReportType, format: "png" | "excel") {
    setExporting(format);
    try {
      await exportTrackingReport(buildExportRequest(type), format);
      toast.success(format === "png" ? "PNG downloaded." : "Excel file downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export.");
    } finally {
      setExporting(null);
    }
  }

  const loadingActivityTabs = tab !== "finalOrder" && (activity.isLoading || (tab === "comparison" && comparisonData.isLoading));

  return (
    <div className="space-y-6">
      <PageHero
        icon="🕒"
        iconBg="linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)"
        title="Tracking History"
        titleGradient="linear-gradient(100deg, #0284C7 0%, #6366F1 60%, #9333EA 100%)"
        description="Daily order-tracking activity - who entered what, when, and what still hasn't started."
      />

      <ReportDashboard overview={overview.data} rangeEntries={allRecords.length} rangeLabel={rangeLabel(range)} />

      <Card className="space-y-4 p-4">
        <DateRangeControl preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
          <Tabs value={tab} onChange={setTab} tabs={REPORT_TYPES} />
        </div>
      </Card>

      <ExportBar activeTab={tab} exporting={exporting} onExport={handleExport} />

      {tab !== "finalOrder" && tab !== "comparison" && <ActivityFilters records={allRecords} value={activityFilters} onChange={setActivityFilters} />}

      {finalOrder.isError && <p className="text-sm text-status-bad">{finalOrder.error instanceof Error ? finalOrder.error.message : "Could not load Tracking History."}</p>}
      {activity.isError && <p className="text-sm text-status-bad">{activity.error instanceof Error ? activity.error.message : "Could not load activity."}</p>}

      {tab === "finalOrder" &&
        (finalOrder.isLoading ? <Loader label="Loading Final Order Report…" /> : <FinalOrderPanel allOrders={finalOrders} filters={finalOrderFilters} onFilters={setFinalOrderFilters} />)}

      {loadingActivityTabs ? (
        <Loader label="Loading activity…" />
      ) : (
        <>
          {tab === "userWise" && (
            <SummaryTablePanel
              rows={userSummaries}
              emptyLabel="No user activity matches these filters."
              drillLabel={() => "View this user's activity →"}
              onDrill={(u) => drillInto({ userId: u.userId })}
              columns={[
                { header: "User", render: (u) => <span className="font-semibold text-ink-900">{u.userName}</span> },
                { header: "Total Entries", align: "right", render: (u) => <span className="font-bold text-brand">{u.totalEntries}</span> },
                { header: "Orders Handled", align: "right", render: (u) => u.orderCount },
                { header: "Stages Entered", align: "right", render: (u) => u.stageCount },
                { header: "First Entry", render: (u) => dateTimeCell(u.firstEntryAt) },
                { header: "Last Entry", render: (u) => dateTimeCell(u.lastEntryAt) },
              ]}
            />
          )}

          {tab === "stageWise" && (
            <SummaryTablePanel
              rows={stageSummaries}
              emptyLabel="No stage activity matches these filters."
              onDrill={(s) => drillInto({ stageKey: s.stageKey })}
              columns={[
                { header: "Stage", render: (s) => <span className="font-semibold text-ink-900">{s.stageLabel}</span> },
                { header: "Total Entries", align: "right", render: (s) => <span className="font-bold text-brand">{s.totalEntries}</span> },
                { header: "Orders", align: "right", render: (s) => s.orderCount },
                { header: "Users", align: "right", render: (s) => s.userCount },
                { header: "Last Entry", render: (s) => dateTimeCell(s.lastEntryAt) },
              ]}
            />
          )}

          {tab === "orderWise" && (
            <SummaryTablePanel
              rows={orderSummaries}
              emptyLabel="No order activity matches these filters."
              onDrill={(o) => drillInto({ orderId: o.orderId })}
              columns={[
                { header: "IO / No", render: (o) => <span className="font-semibold text-ink-900">{o.ioNo}</span> },
                { header: "Buyer", render: (o) => o.buyerName ?? "-" },
                { header: "Style", render: (o) => o.style },
                { header: "Total Entries", align: "right", render: (o) => <span className="font-bold text-brand">{o.totalEntries}</span> },
                { header: "Stages Touched", align: "right", render: (o) => o.stageCount },
                { header: "Users", align: "right", render: (o) => o.userCount },
                { header: "Last Entry", render: (o) => dateTimeCell(o.lastEntryAt) },
              ]}
            />
          )}

          {tab === "activity" && <ActivityPanel records={sequencedRecords} />}

          {tab === "comparison" && comparison && <ComparisonPanel comparison={comparison} />}
        </>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => { overview.refetch(); finalOrder.refetch(); activity.refetch(); comparisonData.refetch(); }}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
