"use client";

import { Fragment, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { useToast } from "@/context/ToastContext";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useProductionChain } from "@/hooks/useProductionChain";
import { buildLotJourney, buildOutputSummary, buildSizeOutput } from "@/lib/chain";
import { buildAccessoryFlows, type AccessoryFlow } from "@/lib/accessories";
import { AccessorySizeBreakdownRow } from "@/components/accessories/AccessorySizeBreakdown";
import { exportCsv, exportExcel, exportPdf } from "@/lib/reportExport";
import { buildJobWorkComparisonRows } from "@/lib/mdOutputReport";
import { formatDisplayDate } from "@/lib/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { BackButton } from "@/components/ui/BackButton";
import { StatCard } from "@/components/ui/StatCard";
import { orderTrackingBasePath } from "@/lib/routing";
import { ShareQrModal } from "@/components/output/ShareQrModal";

/**
 * Production Output & Reports - shared verbatim between /admin/output/[orderId]
 * and /md/output/[orderId] (same component, same everything, per the pattern
 * every other order-tracking page in this app follows - see src/lib/routing.ts).
 * A KPI card row (the procurement chain's own stage-owned figures, plus each
 * production stage's real output), a "Power BI style" dynamic panel,
 * chessboard-style Stage/Size matrix tables, and the fabric/garment trend
 * charts, the production funnel, and lot traceability below them.
 */

const CHART_BLUE = "#155EEF";
const CHART_BLUE_LIGHT = "#7CA6FF";
const CHART_GREEN = "#12B76A";
const CHART_GREEN_LIGHT = "#6EE7B7";
const CHART_RED = "#F04438";
const CHART_AMBER = "#F79009";
const CHART_SLATE = "#CBD5E1";
const CHART_VIOLET = "#7C3AED";

/** The PCS production stages the "against total order qty" comparisons use -
 * keyed by the frozen catalog `key` (see chain.ts's module comment on
 * cosmetic key lookups). Knitting/Dyeing stay KPI-row-only since KG stages
 * have no order-qty baseline to compare against. Degrades gracefully to
 * "not shown" for any order whose plan doesn't include a given stage. */
const PCS_PRODUCTION_STAGES: string[] = ["cutting", "sewing", "checking", "ironing", "packing"];

function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function yieldColor(pct: number): string {
  if (pct >= 98) return CHART_GREEN;
  if (pct >= 95) return CHART_AMBER;
  return CHART_RED;
}

function comboTooltip(unit: string) {
  return function ComboTooltip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const seen = new Set<string>();
    const rows = payload.filter((p) => {
      const key = String(p.dataKey ?? p.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return (
      <div className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-semibold text-ink-800">{label}</p>
        {rows.map((r) => (
          <p key={String(r.dataKey)} style={{ color: r.color }}>
            {r.name}: {Number(r.value ?? 0).toLocaleString()} {unit}
          </p>
        ))}
      </div>
    );
  };
}

function RotatedBarLabel(props: { x?: string | number; y?: string | number; width?: string | number; height?: string | number; value?: string | number }) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const { value } = props;
  if (!value || height < 60) return null;
  const cx = x + width / 2 + 4;
  const cy = y + height - 10;
  return (
    <text x={cx} y={cy} textAnchor="start" fill="#fff" fontSize={11} fontWeight={600} transform={`rotate(-90, ${cx}, ${cy})`}>
      {value}
    </text>
  );
}

/** Checkerboard cell shading - alternates both by row AND by column. */
function cellShade(rowIdx: number, colIdx: number): string {
  return (rowIdx + colIdx) % 2 === 0 ? "bg-white" : "bg-slate-50";
}

const cellBase = "border border-ink-200 px-3 py-2 text-sm";
const cellNum = `${cellBase} text-right font-mono tabular-nums`;

export function OutputView({ orderId }: { orderId: string }) {
  const basePath = orderTrackingBasePath(usePathname());
  const { order, purchaseOrders, usersById, isLoading, isError } = useOrderDetail(orderId);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showShareQr, setShowShareQr] = useState(false);
  const toast = useToast();

  // No PO-scope picker on this page - always all POs combined.
  const selectedPo = null;
  const { chain, bundle, isLoading: chainLoading } = useProductionChain({ orderId, purchaseOrders, poId: null });

  const summary = useMemo(() => (chain ? buildOutputSummary(chain) : null), [chain]);
  const sizeRows = useMemo(() => (chain ? buildSizeOutput(chain) : []), [chain]);
  const lotJourneys = useMemo(() => (chain ? chain.lots.map((l) => buildLotJourney(l, chain)) : []), [chain]);
  const jobWorkRows = useMemo(() => (chain ? buildJobWorkComparisonRows(chain) : []), [chain]);
  const accessoryFlows = useMemo(
    () => buildAccessoryFlows(bundle?.accessoryRequirements ?? [], bundle?.accessoryEntries ?? []),
    [bundle],
  );

  if (isLoading || chainLoading) return <Loader full label="Building the production dashboard…" />;
  if (isError || !order || !chain || !summary) {
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

  // --------------------------- KPI row figures ------------------------------
  // In this order's own configured plan order (seq), not grouped by
  // procurement vs production - same order the workflow itself runs in.
  // Every lookup below degrades to 0 if the order's plan doesn't happen to
  // include that stage.
  const orderConfirmationPcs = chain.byKey.get("order_confirmation")?.output ?? chain.totalPcs;
  const planKg = chain.byKey.get("raw_material_planning")?.output ?? 0;
  const receivedKg = chain.byKey.get("raw_material_inward")?.output ?? 0;
  const knittingKg = chain.byKey.get("knitting")?.output ?? 0;
  const dyeingKg = chain.byKey.get("dyeing")?.output ?? 0;
  const cuttingPcs = chain.byKey.get("cutting")?.output ?? 0;
  const stitchingPcs = chain.byKey.get("sewing")?.output ?? 0;
  const checkingPcs = chain.byKey.get("checking")?.output ?? 0;
  const ironingPcs = chain.byKey.get("ironing")?.output ?? 0;
  const packingPcs = chain.byKey.get("packing")?.output ?? 0;

  // ---------------------- "Power BI" panel data sets -------------------------
  const biRows = PCS_PRODUCTION_STAGES.map((key) => {
    const cs = chain.byKey.get(key);
    const jw = jobWorkRows.find((r) => r.stageKey === key);
    return {
      name: cs?.stage.label.replace(/ \(.*\)/, "") ?? key,
      "In-House": jw?.inHouse ?? 0,
      "Job Work": jw?.jobWork ?? 0,
      Balance: cs?.balance ?? 0,
      "Order Qty": chain.totalPcs,
      efficiencyPct: cs && cs.input > 0 ? Math.round((cs.output / cs.input) * 1000) / 10 : null,
    };
  });
  const overallGaugeData = [{ name: "Completion", value: summary.overallEfficiencyPct ?? 0, fill: CHART_BLUE }];

  // ------------------------- Stage matrix (chessboard) -----------------------
  const stageMatrixRows = jobWorkRows.map((r) => {
    const cs = chain.byKey.get(r.stageKey)!;
    return {
      ...r,
      input: cs.input,
      rejected: cs.rejected,
      balance: cs.balance,
      efficiencyPct: cs.input > 0 ? Math.round((cs.output / cs.input) * 1000) / 10 : null,
    };
  });

  /** PCS total only - KG and PCS stages can't be added into one figure, and
   * PCS (garment count) is the one that matters here. */
  const sumStageCol = (rows: typeof stageMatrixRows, pick: (r: (typeof stageMatrixRows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);
  const stageMatrixTotals = (["PCS"] as const)
    .map((unit) => {
      const rows = stageMatrixRows.filter((r) => r.unit === unit);
      if (rows.length === 0) return null;
      const input = sumStageCol(rows, (r) => r.input);
      const total = sumStageCol(rows, (r) => r.total);
      return {
        unit,
        input,
        inHouse: sumStageCol(rows, (r) => r.inHouse),
        jobWork: sumStageCol(rows, (r) => r.jobWork),
        total,
        rejected: sumStageCol(rows, (r) => r.rejected),
        balance: sumStageCol(rows, (r) => r.balance),
        efficiencyPct: input > 0 ? Math.round((total / input) * 1000) / 10 : null,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const sizeMatrixTotals = {
    ordered: sizeRows.reduce((s, r) => s + r.ordered, 0),
    cut: sizeRows.reduce((s, r) => s + r.cut, 0),
    sewn: sizeRows.every((r) => r.sewn == null) ? null : sizeRows.reduce((s, r) => s + (r.sewn ?? 0), 0),
    packed: sizeRows.every((r) => r.packed == null) ? null : sizeRows.reduce((s, r) => s + (r.packed ?? 0), 0),
    balance: sizeRows.every((r) => r.balance == null) ? null : sizeRows.reduce((s, r) => s + (r.balance ?? 0), 0),
  };

  const sewnPcs = chain.byKey.get("sewing")?.output ?? 0;
  const funnelSteps = [
    { label: "Ordered", value: summary.orderedPcs, color: CHART_BLUE },
    { label: "Cut", value: summary.cutPcs, color: CHART_VIOLET },
    { label: "Sewn", value: sewnPcs, color: CHART_AMBER },
    { label: "Packed", value: summary.packedPcs, color: CHART_GREEN },
  ];

  const lotChartRows = lotJourneys.map((j) => ({ name: j.lot.lotNo, Loss: j.totalLoss, Output: j.steps[j.steps.length - 1]?.qtyOut ?? 0 })).slice(0, 20);

  // seq (this order's own position in its plan) replaces the old global
  // sequence_no - chain.stages is already sorted by it.
  const fabricStoreSeq = chain.byKey.get("fabric_store")?.stage.seq ?? Infinity;
  const kgTrendRows = chain.stages.filter((cs) => cs.unit === "KG" && cs.stage.seq <= fabricStoreSeq).map((cs) => ({ name: cs.stage.label, Send: cs.input, Receive: cs.output }));

  const cuttingSeq = chain.byKey.get("cutting")?.stage.seq ?? 0;
  const packingSeq = chain.byKey.get("packing")?.stage.seq ?? Infinity;
  const pcsTrendRows = chain.stages
    .filter((cs) => cs.unit === "PCS" && cs.stage.seq >= cuttingSeq && cs.stage.seq <= packingSeq)
    .map((cs) => ({ name: cs.stage.label, "Order/Excess Qty": chain.totalPcs, Output: cs.output }));

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
          {order.style} · IO {order.ioNo} · all POs combined
        </p>
      </div>

      {/* ============================= KPI ROW ============================= */}
      <Card>
        <CardHeader title="Order Details — Key Figures" subtitle="Every stage's real recorded quantity, in one row." />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            <KpiTile label="Order Confirmation" value={orderConfirmationPcs} unit="PCS" tone="shortage" />
            <KpiTile label="Raw Material Planning" value={planKg} unit="KG" tone="brand" />
            <KpiTile label="Raw Material Inward" value={receivedKg} unit="KG" tone="good" />
            <KpiTile label="Knitting" value={knittingKg} unit="KG" tone="brand" />
            <KpiTile label="Dyeing" value={dyeingKg} unit="KG" tone="shortage" />
            <KpiTile label="Cutting" value={cuttingPcs} unit="PCS" tone="warn" />
            <KpiTile label="Sewing (Stitching)" value={stitchingPcs} unit="PCS" tone="warn" />
            <KpiTile label="Checking" value={checkingPcs} unit="PCS" tone="neutral" />
            <KpiTile label="Ironing" value={ironingPcs} unit="PCS" tone="neutral" />
            <KpiTile label="Packing" value={packingPcs} unit="PCS" tone="good" />
          </div>
        </CardBody>
      </Card>

      {/* ========================= POWER BI PANEL =========================== */}
      <Card>
        <CardHeader title="Dynamic Dashboard" subtitle="Completion gauge, stage efficiency snapshot, and in-house vs job-work vs balance across the garment line." />
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
            <div className="relative mx-auto h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={overallGaugeData} innerRadius="75%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={16}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={8} fill={CHART_BLUE} background={{ fill: "#EEF2FA" }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-extrabold tabular-nums text-ink-900">{summary.overallEfficiencyPct != null ? `${summary.overallEfficiencyPct}%` : "-"}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Overall Completion</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Stage Efficiency Snapshot</p>
              {biRows.map((r) => (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs font-medium text-ink-700">{r.name}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(r.efficiencyPct ?? 0, 0), 100)}%`, backgroundColor: yieldColor(r.efficiencyPct ?? 0) }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums" style={{ color: yieldColor(r.efficiencyPct ?? 0) }}>
                    {r.efficiencyPct != null ? `${r.efficiencyPct}%` : "-"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={biRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
                <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickFormatter={(v: number) => compactNumber(v)} />
                <Tooltip formatter={(value: number, key: string) => [`${value.toLocaleString()} PCS`, key]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Order Qty" fill={CHART_SLATE} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="In-House" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Job Work" fill={CHART_AMBER} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Balance" fill={CHART_RED} radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* ===================== CHESSBOARD MATRIX TABLES ====================== */}
      <Card>
        <CardHeader title="Stage Matrix" subtitle="Every production stage, in-house vs job work, in one grid — replaces the plain stage-by-stage table." />
        <CardBody>
          <div className="overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                  {["Stage", "Unit", "Input", "In-House", "Job Work", "Total Output", "Rejected", "Balance", "Efficiency"].map((h) => (
                    <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stageMatrixRows.map((r, rowIdx) => (
                  <tr key={r.stageKey}>
                    <td className={`${cellBase} font-semibold text-ink-900 ${cellShade(rowIdx, 0)}`}>{r.stageLabel}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 1)}`}>
                      <Badge tone={r.unit === "KG" ? "neutral" : "brand"}>{r.unit}</Badge>
                    </td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 2)}`}>{r.input.toLocaleString()}</td>
                    <td className={`${cellNum} text-blue-700 ${cellShade(rowIdx, 3)}`}>{r.inHouse.toLocaleString()}</td>
                    <td className={`${cellNum} text-amber-700 ${cellShade(rowIdx, 4)}`}>{r.jobWork.toLocaleString()}</td>
                    <td className={`${cellNum} font-semibold text-status-good ${cellShade(rowIdx, 5)}`}>{r.total.toLocaleString()}</td>
                    <td className={`${cellNum} text-status-bad ${cellShade(rowIdx, 6)}`}>{r.rejected ? r.rejected.toLocaleString() : "-"}</td>
                    <td className={`${cellNum} ${r.balance > 0 ? "text-amber-600" : "text-ink-400"} ${cellShade(rowIdx, 7)}`}>{r.balance ? r.balance.toLocaleString() : "-"}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 8)}`}>{r.efficiencyPct != null ? `${r.efficiencyPct}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {stageMatrixTotals.map((t) => (
                  <tr key={t.unit} className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                    <td className={`${cellBase} border-l-4 border-l-blue-600 text-blue-900`}>Total ({t.unit})</td>
                    <td className={cellNum}>
                      <Badge tone="brand">{t.unit}</Badge>
                    </td>
                    <td className={`${cellNum} text-blue-900`}>{t.input.toLocaleString()}</td>
                    <td className={`${cellNum} text-blue-700`}>{t.inHouse.toLocaleString()}</td>
                    <td className={`${cellNum} text-amber-700`}>{t.jobWork.toLocaleString()}</td>
                    <td className={`${cellNum} text-emerald-700`}>{t.total.toLocaleString()}</td>
                    <td className={`${cellNum} text-status-bad`}>{t.rejected ? t.rejected.toLocaleString() : "-"}</td>
                    <td className={`${cellNum} ${t.balance > 0 ? "text-amber-700" : "text-ink-400"}`}>{t.balance ? t.balance.toLocaleString() : "-"}</td>
                    <td className={`${cellNum} text-blue-900`}>{t.efficiencyPct != null ? `${t.efficiencyPct}%` : "-"}</td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>

      {accessoryFlows.length > 0 && (
        <Card>
          <CardHeader title="Accessories" subtitle="Required → Purchase → Inward → Dispatch, per accessory on this order - tracked separately from the fabric/garment chain above." />
          <CardBody>
            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                    {["Accessory", "Unit", "Required", "Purchased", "Inward", "Dispatched", "Balance", "Status"].map((h) => (
                      <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
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
                  <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
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

      <Card>
        <CardHeader title="Size Matrix" subtitle="Ordered → cut → sewn → packed, per size — replaces the plain size-wise table." />
        <CardBody>
          <div className="overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                  {["Size", "Ordered", "Cut", "Sewn", "Packed", "Balance"].map((h) => (
                    <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizeRows.map((s, rowIdx) => (
                  <tr key={s.sizeCode}>
                    <td className={`${cellBase} font-semibold text-ink-900 ${cellShade(rowIdx, 0)}`}>{s.sizeCode}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 1)}`}>{s.ordered.toLocaleString()}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 2)}`}>{s.cut.toLocaleString()}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 3)}`}>{s.sewn == null ? "-" : s.sewn.toLocaleString()}</td>
                    <td className={`${cellNum} text-status-good ${cellShade(rowIdx, 4)}`}>{s.packed == null ? "-" : s.packed.toLocaleString()}</td>
                    <td className={`${cellNum} ${s.balance == null ? "" : s.balance > 0 ? "text-amber-600" : "text-status-good"} ${cellShade(rowIdx, 5)}`}>{s.balance == null ? "-" : s.balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                  <td className={`${cellBase} border-l-4 border-l-blue-600 text-blue-900`}>Total</td>
                  <td className={`${cellNum} text-blue-900`}>{sizeMatrixTotals.ordered.toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{sizeMatrixTotals.cut.toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{sizeMatrixTotals.sewn == null ? "-" : sizeMatrixTotals.sewn.toLocaleString()}</td>
                  <td className={`${cellNum} text-emerald-700`}>{sizeMatrixTotals.packed == null ? "-" : sizeMatrixTotals.packed.toLocaleString()}</td>
                  <td className={`${cellNum} ${sizeMatrixTotals.balance ? "text-amber-700" : "text-ink-400"}`}>{sizeMatrixTotals.balance == null ? "-" : sizeMatrixTotals.balance.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ===================== EXISTING CHARTS (kept, moved down) =========== */}
      <Card>
        <CardHeader title="Fabric Flow Trend: Send vs Receive (KG)" subtitle="Order Confirmation → Fabric Store. What each stage sent on against what came back, stage by stage." />
        <CardBody className="p-2 sm:p-3">
          {kgTrendRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">Nothing recorded yet for the fabric stages.</p>
          ) : (
            <div className="h-[28rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={kgTrendRows} margin={{ top: 28, right: 16, left: -8, bottom: 8 }} barCategoryGap="16%" barGap={4}>
                  <defs>
                    <linearGradient id="gradKgSend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BLUE_LIGHT} />
                      <stop offset="100%" stopColor={CHART_BLUE} />
                    </linearGradient>
                    <linearGradient id="gradKgReceive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_GREEN_LIGHT} />
                      <stop offset="100%" stopColor={CHART_GREEN} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={72} tick={{ fontSize: 11, fill: "#667085" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#667085" }} tickFormatter={(v: number) => compactNumber(v)} width={52} />
                  <Tooltip content={comboTooltip("KG")} />
                  <Legend wrapperStyle={{ fontSize: 13, fontWeight: 600, paddingTop: 8 }} iconType="circle" />
                  <Bar dataKey="Send" fill="url(#gradKgSend)" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    <LabelList dataKey="name" content={RotatedBarLabel} />
                    <LabelList dataKey="Send" position="top" formatter={(v: number) => compactNumber(v)} style={{ fontSize: 10, fontWeight: 600, fill: CHART_BLUE }} />
                  </Bar>
                  <Bar dataKey="Receive" fill="url(#gradKgReceive)" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    <LabelList dataKey="Receive" position="top" formatter={(v: number) => compactNumber(v)} style={{ fontSize: 10, fontWeight: 600, fill: CHART_GREEN }} />
                  </Bar>
                  <Line type="monotone" dataKey="Send" stroke={CHART_BLUE} strokeWidth={2.5} dot={{ r: 4, fill: CHART_BLUE, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 6 }} legendType="none" />
                  <Line type="monotone" dataKey="Receive" stroke={CHART_GREEN} strokeWidth={2.5} dot={{ r: 4, fill: CHART_GREEN, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 6 }} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Cutting → Packing Trend: Order/Excess vs Output (PCS)" subtitle="The order's quantity, including the extra % margin, held flat against what each stage actually turned out." />
        <CardBody className="p-2 sm:p-3">
          {pcsTrendRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">Nothing recorded yet for the garment stages.</p>
          ) : (
            <div className="h-[28rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pcsTrendRows} margin={{ top: 28, right: 16, left: -8, bottom: 8 }} barCategoryGap="16%" barGap={4}>
                  <defs>
                    <linearGradient id="gradPcsOrder" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E4E7EC" />
                      <stop offset="100%" stopColor={CHART_SLATE} />
                    </linearGradient>
                    <linearGradient id="gradPcsOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FCD34D" />
                      <stop offset="100%" stopColor={CHART_AMBER} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={72} tick={{ fontSize: 11, fill: "#667085" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#667085" }} tickFormatter={(v: number) => compactNumber(v)} width={52} />
                  <Tooltip content={comboTooltip("PCS")} />
                  <Legend wrapperStyle={{ fontSize: 13, fontWeight: 600, paddingTop: 8 }} iconType="circle" />
                  <Bar dataKey="Order/Excess Qty" fill="url(#gradPcsOrder)" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    <LabelList dataKey="name" content={RotatedBarLabel} />
                    <LabelList dataKey="Order/Excess Qty" position="top" formatter={(v: number) => compactNumber(v)} style={{ fontSize: 10, fontWeight: 600, fill: "#667085" }} />
                  </Bar>
                  <Bar dataKey="Output" fill="url(#gradPcsOutput)" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    <LabelList dataKey="Output" position="top" formatter={(v: number) => compactNumber(v)} style={{ fontSize: 10, fontWeight: 600, fill: CHART_AMBER }} />
                  </Bar>
                  <Line type="monotone" dataKey="Order/Excess Qty" stroke={CHART_SLATE} strokeWidth={2.5} strokeDasharray="6 4" dot={false} legendType="none" />
                  <Line type="monotone" dataKey="Output" stroke={CHART_AMBER} strokeWidth={2.5} dot={{ r: 4, fill: CHART_AMBER, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 6 }} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="How far the order has got" subtitle="Each step as a share of the ordered quantity, and what it dropped from the step before." />
        <CardBody className="space-y-2.5">
          {funnelSteps.map((step, i) => {
            const pct = summary.orderedPcs > 0 ? (step.value / summary.orderedPcs) * 100 : 0;
            const prev = i > 0 ? funnelSteps[i - 1].value : null;
            const drop = prev != null ? prev - step.value : null;
            return (
              <div key={step.label}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold text-ink-800">{step.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-bold tabular-nums text-ink-900">{step.value.toLocaleString()} PCS</span>
                    <span className="tabular-nums text-ink-400">{Math.round(pct)}%</span>
                    {drop != null && drop > 0 && <span className="tabular-nums text-status-bad">−{drop.toLocaleString()}</span>}
                  </span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 0)}%`, backgroundColor: step.color }} />
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Size-wise output" subtitle="Ordered → cut → packed per size, with the outstanding balance behind it." />
        <CardBody>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sizeRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="gradOrderedBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_BLUE_LIGHT} />
                    <stop offset="100%" stopColor={CHART_BLUE} />
                  </linearGradient>
                  <linearGradient id="gradCutBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FCD34D" />
                    <stop offset="100%" stopColor={CHART_AMBER} />
                  </linearGradient>
                  <linearGradient id="gradPackedBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_GREEN_LIGHT} />
                    <stop offset="100%" stopColor={CHART_GREEN} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                <XAxis dataKey="sizeCode" tick={{ fontSize: 11, fill: "#667085" }} />
                <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickFormatter={(v: number) => compactNumber(v)} />
                <Tooltip formatter={(value: number, key: string) => [`${value.toLocaleString()} PCS`, key]} contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ordered" name="Ordered" fill="url(#gradOrderedBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="cut" name="Cut" fill="url(#gradCutBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="packed" name="Packed" fill="url(#gradPackedBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="balance" name="Outstanding" fill={CHART_SLATE} radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------- Lot traceability ------------------------- */}
      {lotJourneys.length > 0 && (
        <Card>
          <CardHeader title="Lot traceability" subtitle="Every lot, every stage it passed through, and what it lost on the way." />
          <CardBody className="space-y-5">
            {lotChartRows.length > 0 && (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lotChartRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Output" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Loss" fill={CHART_RED} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-3">
              {lotJourneys.map((j) => (
                <details key={j.lot.id} className="rounded-xl border border-ink-100 bg-white">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="font-mono text-sm font-bold text-ink-900">{j.lot.lotNo}</span>
                    <span className="text-xs text-ink-500">
                      {j.steps.length} stage{j.steps.length === 1 ? "" : "s"}
                    </span>
                    {j.totalLoss > 0 && <Badge tone="warn">{j.totalLoss.toLocaleString()} lost</Badge>}
                  </summary>
                  <div className="overflow-x-auto border-t border-ink-100">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                          <th className="px-3 py-2 text-left font-semibold">Stage</th>
                          <th className="px-3 py-2 text-right font-semibold">In</th>
                          <th className="px-3 py-2 text-right font-semibold">Out</th>
                          <th className="px-3 py-2 text-right font-semibold">Rejected</th>
                          <th className="px-3 py-2 text-right font-semibold">Loss</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {j.steps.map((s) => (
                          <tr key={s.stage.id}>
                            <td className="px-3 py-2 font-medium text-ink-800">
                              {s.stage.label} <span className="text-[10px] font-normal text-ink-400">{s.unit}</span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.qtyIn.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-status-good">{s.qtyOut.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-status-bad">{s.qtyRejected.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.loss.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <p className="pb-4 text-center text-xs text-ink-400">Report generated {formatDisplayDate(new Date().toISOString().slice(0, 10))} · every figure above is derived from the recorded entries.</p>

      <ShareQrModal open={showShareQr} onClose={() => setShowShareQr(false)} order={order} />
    </div>
  );
}

type StatCardTone = "neutral" | "good" | "warn" | "bad" | "brand" | "shortage" | "rejected";

function KpiTile({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: StatCardTone }) {
  return <StatCard label={label} value={value.toLocaleString()} hint={unit} tone={tone} />;
}

function sumAccessory(flows: AccessoryFlow[], pick: (f: AccessoryFlow) => number): string {
  return flows.reduce((total, f) => total + pick(f), 0).toLocaleString();
}
