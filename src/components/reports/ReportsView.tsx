"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import { useTrackingHistory } from "@/hooks/useTrackingHistory";
import { useOrdersList } from "@/hooks/useOrdersList";
import { useBuyers } from "@/hooks/useBuyers";
import { useToast } from "@/context/ToastContext";
import { rangeLabel, resolveRange, type DateRange } from "@/lib/trackingHistory";
import { buildReportRows, describeReportFilters, REPORT_PRESETS, toDatePreset, type OrderScope, type ReportFilters, type ReportPreset } from "@/lib/reports";
import { exportReportExcel, exportReportPng } from "@/lib/reportsExport";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { PageHero } from "@/components/ui/SectionCard";
import { ReportPeriodControl, type ReportCustomRange } from "./ReportPeriodControl";
import { OrderScopeControl } from "./OrderScopeControl";
import { ReportTable } from "./ReportTable";

/**
 * Reports - Select Period -> Select Orders/Buyer -> Generate Report -> View
 * -> Export. Deliberately a simpler, flatter cut of Tracking History's data
 * (see lib/reports.ts): no live-updating filters, just a Generate step that
 * snapshots the current picks and fetches that one range, so the table and
 * whatever gets exported always match exactly what was asked for.
 */
export function ReportsView() {
  const toast = useToast();
  // What was picked stays picked for the life of the browser tab (the generated
  // report itself is rebuilt with Generate).
  const { appUser } = useAuth();
  const who = appUser?.id ?? "anon";
  const [preset, setPreset] = usePersistedState<ReportPreset>(`ot:reports:${who}:preset`, "today", (v) => REPORT_PRESETS.some((p) => p.key === v));
  const [custom, setCustom] = usePersistedState<ReportCustomRange>(`ot:reports:${who}:custom`, { from: "", to: "" });
  const [scope, setScope] = usePersistedState<OrderScope>(`ot:reports:${who}:scope`, "all", (v) => ["all", "specific", "buyer"].includes(v as string));
  const [orderIdList, setOrderIdList] = usePersistedState<string[]>(`ot:reports:${who}:orders`, []);
  const orderIds = useMemo(() => new Set(orderIdList), [orderIdList]);
  const setOrderIds = (next: Set<string>) => setOrderIdList(Array.from(next));
  const [buyerId, setBuyerId] = usePersistedState(`ot:reports:${who}:buyer`, "");

  const [generated, setGenerated] = useState<{ range: DateRange; filters: ReportFilters } | null>(null);
  const [exporting, setExporting] = useState<"png" | "excel" | null>(null);

  const ordersList = useOrdersList();
  const { data: buyers = [] } = useBuyers();
  const report = useTrackingHistory(generated?.range ?? resolveRange("today", custom), !!generated);

  const orderOptions = useMemo(() => (ordersList.data ?? []).map((o) => ({ id: o.id, ioNo: o.ioNo, style: o.style, buyerName: o.buyer?.name ?? null })), [ordersList.data]);

  const rows = useMemo(() => {
    if (!generated || !report.data) return [];
    return buildReportRows(report.data.orders, generated.filters);
  }, [generated, report.data]);

  const canGenerate = scope !== "buyer" || !!buyerId;

  // Whether the form has changed since the last Generate click - the table
  // and Export always reflect that last snapshot, never the draft, so this
  // is purely a hint to regenerate, not something that blocks or changes
  // what's currently shown.
  const draftRange = resolveRange(toDatePreset(preset), custom);
  const isStale =
    !!generated &&
    (draftRange.fromISO !== generated.range.fromISO ||
      draftRange.toISO !== generated.range.toISO ||
      scope !== generated.filters.scope ||
      buyerId !== generated.filters.buyerId ||
      orderIds.size !== generated.filters.orderIds.size ||
      [...orderIds].some((id) => !generated.filters.orderIds.has(id)));

  function handleGenerate() {
    if (!canGenerate) {
      toast.error("Pick a buyer first.");
      return;
    }
    if (scope === "specific" && orderIds.size === 0) {
      toast.error("Pick at least one order first.");
      return;
    }
    setGenerated({ range: resolveRange(toDatePreset(preset), custom), filters: { scope, orderIds: new Set(orderIds), buyerId } });
  }

  async function handleExport(format: "png" | "excel") {
    if (!generated) return;
    setExporting(format);
    try {
      const meta = { range: generated.range, filterSummary: describeReportFilters(generated.filters, buyers.find((b) => b.id === generated.filters.buyerId)?.name ?? null, generated.filters.orderIds.size) };
      if (format === "png") await exportReportPng(rows, meta);
      else await exportReportExcel(rows, meta);
      toast.success(format === "png" ? "PNG downloaded." : "Excel file downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon="🧾"
        iconBg="linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)"
        title="Reports"
        titleGradient="linear-gradient(100deg, #7C3AED 0%, #DB2777 60%, #F59E0B 100%)"
        description="Pick a period and a set of orders, generate a clean Order / Buyer / Stage / Entries report, and export it."
      />

      <Card className="space-y-5 p-4">
        <ReportPeriodControl preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
        <div className="border-t border-ink-100 pt-4">
          <OrderScopeControl scope={scope} onScope={setScope} orders={orderOptions} orderIds={orderIds} onOrderIds={setOrderIds} buyerId={buyerId} onBuyerId={setBuyerId} />
        </div>
        <div className="flex items-center justify-between border-t border-ink-100 pt-4">
          <p className="text-xs text-ink-500">
            {!generated ? "Pick a period and orders, then generate the report." : isStale ? "Filters changed - regenerate to refresh the report below." : `Showing: ${rangeLabel(generated.range)}`}
          </p>
          <Button onClick={handleGenerate} disabled={ordersList.isLoading}>
            {isStale ? "Regenerate Report" : "Generate Report"}
          </Button>
        </div>
      </Card>

      {generated && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/70 p-3">
            <div>
              <p className="text-sm font-bold text-ink-900">{rangeLabel(generated.range)}</p>
              <p className="text-xs text-ink-500">{describeReportFilters(generated.filters, buyers.find((b) => b.id === generated.filters.buyerId)?.name ?? null, generated.filters.orderIds.size)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => handleExport("png")} isLoading={exporting === "png"} disabled={!!exporting || report.isLoading}>
                Export PNG
              </Button>
              <Button onClick={() => handleExport("excel")} isLoading={exporting === "excel"} disabled={!!exporting || report.isLoading}>
                Export Excel
              </Button>
            </div>
          </div>

          {report.isLoading ? (
            <Loader label="Generating report…" />
          ) : report.isError ? (
            <p className="text-sm text-status-bad">{report.error instanceof Error ? report.error.message : "Could not generate the report."}</p>
          ) : (
            <ReportTable rows={rows} />
          )}
        </>
      )}
    </div>
  );
}
