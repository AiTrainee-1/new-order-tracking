"use client";

import { Fragment, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "@/context/ToastContext";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useProductionChain } from "@/hooks/useProductionChain";
import { buildAccessoryFlows, type AccessoryFlow } from "@/lib/accessories";
import { AccessorySizeBreakdownRow } from "@/components/accessories/AccessorySizeBreakdown";
import { exportCsv, exportExcel, exportPdf } from "@/lib/reportExport";
import { formatDisplayDate } from "@/lib/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { BackButton } from "@/components/ui/BackButton";
import { orderTrackingBasePath } from "@/lib/routing";
import { ShareQrModal } from "@/components/output/ShareQrModal";
import {
  buildOutputDashboard,
  cellBase,
  cellNum,
  cellShade,
  FabricTrendCard,
  GarmentTrendCard,
  LotTraceabilityCard,
  MatrixHead,
  matrixTotalRow,
  OrderFunnelCard,
  OutputDynamicDashboardCard,
  OutputKpiCard,
  SizeMatrixCard,
  SizeOutputChartCard,
  StageMatrixCard,
} from "@/components/output/outputShared";

/**
 * Production Output & Reports - shared verbatim between /admin/output/[orderId]
 * and /md/output/[orderId] (same component, same everything, per the pattern
 * every other order-tracking page in this app follows - see src/lib/routing.ts).
 * A KPI card row (the procurement chain's own stage-owned figures, plus each
 * production stage's real output), a "Power BI style" dynamic panel,
 * chessboard-style Stage/Size matrix tables, and the fabric/garment trend
 * charts, the production funnel, and lot traceability below them. Those
 * sections live in outputShared, shared with the public QR share page.
 */

export function OutputView({ orderId }: { orderId: string }) {
  const basePath = orderTrackingBasePath(usePathname());
  const { order, purchaseOrders, usersById, isLoading, isError } = useOrderDetail(orderId);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showShareQr, setShowShareQr] = useState(false);
  const toast = useToast();

  // No PO-scope picker on this page - always all POs combined.
  const selectedPo = null;
  const { chain, bundle, isLoading: chainLoading } = useProductionChain({ orderId, purchaseOrders, poId: null });

  const dashboard = useMemo(() => (chain ? buildOutputDashboard(chain) : null), [chain]);
  const accessoryFlows = useMemo(
    () => buildAccessoryFlows(bundle?.accessoryRequirements ?? [], bundle?.accessoryEntries ?? []),
    [bundle],
  );

  if (isLoading || chainLoading) return <Loader full label="Building the production dashboard…" />;
  if (isError || !order || !chain || !dashboard) {
    return <p className="text-sm text-status-bad">Couldn&apos;t load this order&apos;s output.</p>;
  }

  const ctx = { order, po: selectedPo, chain, usersById };

  async function download(kind: "csv" | "pdf" | "excel") {
    setDownloading(kind);
    try {
      if (kind === "csv") exportCsv(ctx);
      else if (kind === "pdf") await exportPdf(ctx);
      else await exportExcel(ctx);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the report.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to={`${basePath}/orders/${order.id}`} label="Back to Order" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowShareQr(true)}>
            Share QR
          </Button>
          <Button size="sm" variant="secondary" onClick={() => download("csv")} isLoading={downloading === "csv"}>
            CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => download("pdf")} isLoading={downloading === "pdf"}>
            Download PDF
          </Button>
          <Button size="sm" onClick={() => download("excel")} isLoading={downloading === "excel"}>
            Download Excel
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Production Output</h1>
        <p className="text-sm text-ink-500">
          {order.style} · IO {order.ioNo}{order.buyer ? ` · ${order.buyer.name}` : ""} · all POs combined
        </p>
      </div>

      <OutputKpiCard dashboard={dashboard} />
      <OutputDynamicDashboardCard dashboard={dashboard} variant="app" />
      <StageMatrixCard dashboard={dashboard} variant="app" />

      {accessoryFlows.length > 0 && (
        <Card>
          <CardHeader title="Accessories" subtitle="Required → Purchase → Inward → Dispatch, per accessory on this order - tracked separately from the fabric/garment chain above." />
          <CardBody>
            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="w-full min-w-[760px] text-sm">
                <MatrixHead columns={["Accessory", "Unit", "Required", "Purchased", "Inward", "Dispatched", "Balance", "Status"]} />
                <tbody>
                  {accessoryFlows.map((f, rowIdx) => {
                    const balance = f.balanceToPurchase || f.balanceToInward || f.balanceToDispatch;
                    const started = f.totals.purchased + f.totals.inward + f.totals.dispatched > 0;
                    const tone = f.isComplete ? "good" : started ? "warn" : "neutral";
                    const label = f.isComplete ? "Complete" : started ? "Partial" : "Pending";
                    return (
                      <Fragment key={f.requirement.id}>
                        <tr>
                          <td className={`${cellBase} font-semibold text-ink-900 ${cellShade(rowIdx, 0)}`}>{f.requirement.name}</td>
                          <td className={`${cellBase} text-ink-500 ${cellShade(rowIdx, 1)}`}>{f.requirement.unit}</td>
                          <td className={`${cellNum} ${cellShade(rowIdx, 2)}`}>{f.totals.required.toLocaleString()}</td>
                          <td className={`${cellNum} ${cellShade(rowIdx, 3)}`}>{f.totals.purchased.toLocaleString()}</td>
                          <td className={`${cellNum} ${cellShade(rowIdx, 4)}`}>{f.totals.inward.toLocaleString()}</td>
                          <td className={`${cellNum} text-status-good ${cellShade(rowIdx, 5)}`}>{f.totals.dispatched.toLocaleString()}</td>
                          <td className={`${cellNum} font-semibold ${balance > 0 ? "text-amber-600" : "text-status-good"} ${cellShade(rowIdx, 6)}`}>{balance.toLocaleString()}</td>
                          <td className={`${cellBase} text-right ${cellShade(rowIdx, 7)}`}>
                            <Badge tone={tone}>{label}</Badge>
                          </td>
                        </tr>
                        <AccessorySizeBreakdownRow flow={f} unit={f.requirement.unit} colSpan={8} />
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className={matrixTotalRow}>
                    <td className={`${cellBase} border-l-4 border-l-blue-600 text-blue-900`} colSpan={2}>
                      Total
                    </td>
                    <td className={`${cellNum} text-blue-900`}>{sumAccessory(accessoryFlows, (f) => f.totals.required)}</td>
                    <td className={`${cellNum} text-blue-900`}>{sumAccessory(accessoryFlows, (f) => f.totals.purchased)}</td>
                    <td className={`${cellNum} text-blue-900`}>{sumAccessory(accessoryFlows, (f) => f.totals.inward)}</td>
                    <td className={`${cellNum} text-emerald-700`}>{sumAccessory(accessoryFlows, (f) => f.totals.dispatched)}</td>
                    <td className={cellNum} />
                    <td className={cellBase} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      <SizeMatrixCard dashboard={dashboard} variant="app" />
      <FabricTrendCard dashboard={dashboard} variant="app" />
      <GarmentTrendCard dashboard={dashboard} variant="app" />
      <OrderFunnelCard dashboard={dashboard} />
      <SizeOutputChartCard dashboard={dashboard} variant="app" />
      <LotTraceabilityCard dashboard={dashboard} variant="app" />

      <p className="pb-4 text-center text-xs text-ink-400">Report generated {formatDisplayDate(new Date().toISOString().slice(0, 10))} · every figure above is derived from the recorded entries.</p>

      <ShareQrModal open={showShareQr} onClose={() => setShowShareQr(false)} order={order} />
    </div>
  );
}

function sumAccessory(flows: AccessoryFlow[], pick: (f: AccessoryFlow) => number): string {
  return flows.reduce((total, f) => total + pick(f), 0).toLocaleString();
}
