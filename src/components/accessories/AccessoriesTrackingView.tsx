"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAccessoriesSummary, type AccessorySummaryRow } from "@/hooks/useAccessoriesSummary";
import { buildAccessoryFlow, type AccessoryFlow } from "@/lib/accessories";
import { formatDisplayDate } from "@/lib/workflow";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Input, Select } from "@/components/ui/FormControls";

/**
 * Accessories Management/Tracking - shared verbatim between /admin/accessories
 * and /md/accessories, the same "one component, two thin page wrappers"
 * pattern OutputView uses. Cross-order, read-mostly: every accessory tracked
 * by any order's Accessories stage, searchable/filterable, with its own
 * Stage Matrix (deliberately separate from the production Stage Matrix on
 * the Output screen - see OutputView.tsx) and its own chart palette, matching
 * OutputView's recharts conventions (CHART_* colors, dashed CartesianGrid,
 * radius={[4,4,0,0]} bars) so it reads as part of the same app.
 */

const CHART_BLUE = "#155EEF";
const CHART_GREEN = "#12B76A";
const CHART_AMBER = "#F79009";
const CHART_VIOLET = "#7C3AED";
const CHART_SLATE = "#CBD5E1";

function cellShade(rowIdx: number, colIdx: number): string {
  return (rowIdx + colIdx) % 2 === 0 ? "bg-white" : "bg-slate-50";
}
const cellBase = "border border-ink-200 px-3 py-2 text-sm";
const cellNum = `${cellBase} text-right font-mono tabular-nums`;

type StageBucket = "pending" | "purchase" | "inward" | "complete";

const BUCKET_LABEL: Record<StageBucket, string> = {
  pending: "Pending",
  purchase: "Purchased",
  inward: "Inward",
  complete: "Complete",
};

const BUCKET_TONE: Record<StageBucket, "neutral" | "warn" | "info" | "good"> = {
  pending: "neutral",
  purchase: "warn",
  inward: "info",
  complete: "good",
};

function bucketOf(flow: AccessoryFlow): StageBucket {
  if (flow.isComplete) return "complete";
  if (flow.totals.inward > 0 || flow.totals.dispatched > 0) return "inward";
  if (flow.totals.purchased > 0) return "purchase";
  return "pending";
}

interface Row {
  raw: AccessorySummaryRow;
  flow: AccessoryFlow;
  bucket: StageBucket;
  latestVendor: string | null;
  lastActivity: string;
}

export function AccessoriesTrackingView() {
  const { data, isLoading, isError } = useAccessoriesSummary();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | StageBucket>("all");
  const [vendorFilter, setVendorFilter] = useState("");
  /** The top-level order picker - separate from the directory's own
   *  search/vendor/stage filters below. Selecting an order here swaps the
   *  whole page into a single-order drill-down (OrderAccessoriesDetail)
   *  instead of filtering one table within the fleet-wide dashboard. */
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return data.map((r) => {
      const flow = buildAccessoryFlow(r, r.entries);
      const vendorEntries = r.entries.filter((e) => e.vendor).sort((a, b) => b.entryDate.localeCompare(a.entryDate));
      const dates = [r.createdAt, ...r.entries.map((e) => e.createdAt)].sort();
      return {
        raw: r,
        flow,
        bucket: bucketOf(flow),
        latestVendor: vendorEntries[0]?.vendor ?? null,
        lastActivity: dates[dates.length - 1] ?? r.createdAt,
      };
    });
  }, [data]);

  const orders = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.raw.order.id, `${r.raw.order.ioNo} · ${r.raw.order.style}`);
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const vendors = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const e of r.raw.entries) if (e.vendor) set.add(e.vendor);
    return Array.from(set).sort();
  }, [rows]);

  const counts = useMemo(() => {
    const next = { all: rows.length, pending: 0, purchase: 0, inward: 0, complete: 0 };
    for (const r of rows) next[r.bucket]++;
    return next;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter !== "all" && r.bucket !== stageFilter) return false;
      if (vendorFilter && !r.raw.entries.some((e) => e.vendor === vendorFilter)) return false;
      if (!q) return true;
      return (
        r.raw.name.toLowerCase().includes(q) ||
        r.raw.order.ioNo.toLowerCase().includes(q) ||
        r.raw.order.style.toLowerCase().includes(q) ||
        (r.latestVendor?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, stageFilter, vendorFilter]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          required: acc.required + r.flow.totals.required,
          purchased: acc.purchased + r.flow.totals.purchased,
          inward: acc.inward + r.flow.totals.inward,
          dispatched: acc.dispatched + r.flow.totals.dispatched,
        }),
        { required: 0, purchased: 0, inward: 0, dispatched: 0 },
      ),
    [rows],
  );

  const stageTotalsChart = [
    { name: "Required", Qty: totals.required, fill: CHART_SLATE },
    { name: "Purchased", Qty: totals.purchased, fill: CHART_BLUE },
    { name: "Inward", Qty: totals.inward, fill: CHART_VIOLET },
    { name: "Dispatched", Qty: totals.dispatched, fill: CHART_GREEN },
  ];

  const vendorChart = useMemo(() => {
    const byVendor = new Map<string, number>();
    for (const r of rows) {
      for (const e of r.raw.entries) {
        if (e.entryType !== "purchase" || !e.vendor) continue;
        byVendor.set(e.vendor, (byVendor.get(e.vendor) ?? 0) + Number(e.qty));
      }
    }
    return Array.from(byVendor, ([name, Purchased]) => ({ name, Purchased }))
      .sort((a, b) => b.Purchased - a.Purchased)
      .slice(0, 12);
  }, [rows]);

  const orderChart = useMemo(() => {
    const byOrder = new Map<string, { name: string; Required: number; Dispatched: number }>();
    for (const r of rows) {
      const key = r.raw.order.ioNo;
      const entry = byOrder.get(key) ?? { name: key, Required: 0, Dispatched: 0 };
      entry.Required += r.flow.totals.required;
      entry.Dispatched += r.flow.totals.dispatched;
      byOrder.set(key, entry);
    }
    return Array.from(byOrder.values()).slice(0, 15);
  }, [rows]);

  const topAccessoriesChart = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => b.flow.totals.required - a.flow.totals.required)
        .slice(0, 10)
        .map((r) => ({ name: r.raw.name, Required: r.flow.totals.required, Dispatched: r.flow.totals.dispatched })),
    [rows],
  );

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

  if (isLoading) return <Loader full label="Loading the accessories tracker…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load the accessories summary.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Accessories Management</h1>
          <p className="text-sm text-ink-500">
            {selectedOrder ? `${selectedOrder.label}'s accessories - Required → Purchase → Inward → Dispatch.` : "Every accessory tracked across every order - Required → Purchase → Inward → Dispatch."}
          </p>
        </div>
        <Select
          className="!w-auto min-w-[16rem]"
          value={selectedOrderId}
          onChange={(e) => setSelectedOrderId(e.target.value)}
        >
          <option value="">All Orders (fleet-wide view)</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {selectedOrder ? (
        <OrderAccessoriesDetail orderLabel={selectedOrder.label} rows={rows.filter((r) => r.raw.order.id === selectedOrder.id)} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Accessories" value={rows.length} icon="🧷" />
        <StatCard label="Required" value={totals.required.toLocaleString()} tone="brand" icon="📋" />
        <StatCard label="Purchased" value={totals.purchased.toLocaleString()} tone="neutral" icon="🛒" />
        <StatCard label="Inward" value={totals.inward.toLocaleString()} tone="shortage" icon="📥" />
        <StatCard label="Dispatched" value={totals.dispatched.toLocaleString()} tone="good" icon="📤" />
        <StatCard label="Pending" value={counts.pending + counts.purchase + counts.inward} tone="warn" icon="⏳" />
      </div>

      {/* ============================ ANALYTICS ============================ */}
      <Card>
        <CardHeader title="Totals by Stage" subtitle="Required, purchased, inward and dispatched quantities, summed across every order." />
        <CardBody className="p-2 sm:p-3">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageTotalsChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
                <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                <Bar dataKey="Qty" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {stageTotalsChart.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Stage-wise Status" subtitle="How many accessories currently sit at each stage." />
          <CardBody className="space-y-2.5">
            {(["pending", "purchase", "inward", "complete"] as StageBucket[]).map((b) => {
              const count = counts[b];
              const pct = rows.length > 0 ? (count / rows.length) * 100 : 0;
              const color = b === "complete" ? CHART_GREEN : b === "inward" ? CHART_VIOLET : b === "purchase" ? CHART_BLUE : CHART_SLATE;
              return (
                <div key={b}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-ink-800">{BUCKET_LABEL[b]}</span>
                    <span className="tabular-nums text-ink-500">{count}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Vendor-wise Purchases" subtitle="Quantity purchased per vendor, across every order." />
          <CardBody className="p-2 sm:p-3">
            {vendorChart.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-400">No purchases recorded yet.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vendorChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#667085" }} angle={-25} textAnchor="end" interval={0} height={56} />
                    <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                    <Bar dataKey="Purchased" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Order-wise Accessories" subtitle="Required vs dispatched, per order." />
          <CardBody className="p-2 sm:p-3">
            {orderChart.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-400">No accessories recorded yet.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orderChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Required" fill={CHART_SLATE} radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="Dispatched" fill={CHART_GREEN} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quantity-wise Analysis" subtitle="The 10 accessories with the highest required quantity." />
          <CardBody className="p-2 sm:p-3">
            {topAccessoriesChart.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-400">No accessories recorded yet.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topAccessoriesChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#667085" }} angle={-25} textAnchor="end" interval={0} height={56} />
                    <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Required" fill={CHART_AMBER} radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="Dispatched" fill={CHART_GREEN} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ======================= ACCESSORIES STAGE MATRIX ==================== */}
      <Card>
        <CardHeader title="Accessories Stage Matrix" subtitle="Required → Purchase → Inward → Dispatch, per accessory - separate from the production Stage Matrix on the Output screen." />
        <CardBody>
          <div className="overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                  {["Order", "Accessory", "Required", "Purchased", "Inward", "Dispatched", "Status"].map((h) => (
                    <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, rowIdx) => (
                  <tr key={r.raw.id}>
                    <td className={`${cellBase} text-ink-700 ${cellShade(rowIdx, 0)}`}>{r.raw.order.ioNo}</td>
                    <td className={`${cellBase} font-semibold text-ink-900 ${cellShade(rowIdx, 1)}`}>{r.raw.name}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 2)}`}>
                      {r.flow.totals.required.toLocaleString()} {r.raw.unit}
                    </td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 3)}`}>{r.flow.totals.purchased.toLocaleString()}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 4)}`}>{r.flow.totals.inward.toLocaleString()}</td>
                    <td className={`${cellNum} text-status-good ${cellShade(rowIdx, 5)}`}>{r.flow.totals.dispatched.toLocaleString()}</td>
                    <td className={`${cellBase} text-right ${cellShade(rowIdx, 6)}`}>
                      <Badge tone={BUCKET_TONE[r.bucket]}>{BUCKET_LABEL[r.bucket]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                  <td className={`${cellBase} border-l-4 border-l-blue-600 text-blue-900`} colSpan={2}>
                    Total ({filtered.length} shown)
                  </td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(filtered, (r) => r.flow.totals.required).toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(filtered, (r) => r.flow.totals.purchased).toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(filtered, (r) => r.flow.totals.inward).toLocaleString()}</td>
                  <td className={`${cellNum} text-emerald-700`}>{sumBy(filtered, (r) => r.flow.totals.dispatched).toLocaleString()}</td>
                  <td className={cellBase} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ============================= DIRECTORY ============================ */}
      <Card>
        <CardHeader
          title="Accessories Directory"
          subtitle="Search or filter by order, accessory name, vendor, or stage - pick an order above for its full individual detail."
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="Search accessory, order, or vendor…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>

          <FilterTabs
            value={stageFilter}
            onChange={setStageFilter}
            tabs={[
              { key: "all", label: "All", count: counts.all },
              { key: "pending", label: "Pending", count: counts.pending },
              { key: "purchase", label: "Purchased", count: counts.purchase },
              { key: "inward", label: "Inward", count: counts.inward },
              { key: "complete", label: "Complete", count: counts.complete },
            ]}
          />

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">No accessories match these filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2 text-left font-semibold">Order</th>
                    <th className="px-3 py-2 text-left font-semibold">Accessory</th>
                    <th className="px-3 py-2 text-left font-semibold">Vendor</th>
                    <th className="px-3 py-2 text-left font-semibold">Stage</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance</th>
                    <th className="px-3 py-2 text-left font-semibold">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map((r) => {
                    const balance = r.flow.balanceToPurchase || r.flow.balanceToInward || r.flow.balanceToDispatch;
                    return (
                      <tr
                        key={r.raw.id}
                        className="cursor-pointer bg-white hover:bg-indigo-50/40"
                        onClick={() => setSelectedOrderId(r.raw.order.id)}
                        title={`Open ${r.raw.order.ioNo}'s accessories`}
                      >
                        <td className="px-3 py-2 text-ink-700">
                          {r.raw.order.ioNo} <span className="text-ink-400">· {r.raw.order.style}</span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-ink-900">{r.raw.name}</td>
                        <td className="px-3 py-2 text-ink-600">{r.latestVendor ?? "-"}</td>
                        <td className="px-3 py-2">
                          <Badge tone={BUCKET_TONE[r.bucket]}>{BUCKET_LABEL[r.bucket]}</Badge>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${balance > 0 ? "text-amber-600 font-semibold" : "text-status-good"}`}>
                          {balance.toLocaleString()} {r.raw.unit}
                        </td>
                        <td className="px-3 py-2 text-ink-500">{formatDisplayDate(r.lastActivity.slice(0, 10))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-order drill-down - the individual view: every accessory for THIS
// order, with its own full entry ledger, no fleet-wide numbers mixed in.
// ---------------------------------------------------------------------------

function OrderAccessoriesDetail({ orderLabel, rows }: { orderLabel: string; rows: Row[] }) {
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          required: acc.required + r.flow.totals.required,
          purchased: acc.purchased + r.flow.totals.purchased,
          inward: acc.inward + r.flow.totals.inward,
          dispatched: acc.dispatched + r.flow.totals.dispatched,
        }),
        { required: 0, purchased: 0, inward: 0, dispatched: 0 },
      ),
    [rows],
  );

  const entries = useMemo(
    () =>
      rows
        .flatMap((r) => r.raw.entries.map((e) => ({ entry: e, name: r.raw.name, unit: r.raw.unit })))
        .sort((a, b) => b.entry.entryDate.localeCompare(a.entry.entryDate) || b.entry.createdAt.localeCompare(a.entry.createdAt)),
    [rows],
  );

  const pending = rows.filter((r) => r.bucket !== "complete").length;

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">
            {orderLabel} has no accessories tracked yet - add one under the Accessories stage on this order.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Accessories" value={rows.length} icon="🧷" />
        <StatCard label="Required" value={totals.required.toLocaleString()} tone="brand" icon="📋" />
        <StatCard label="Purchased" value={totals.purchased.toLocaleString()} tone="neutral" icon="🛒" />
        <StatCard label="Inward" value={totals.inward.toLocaleString()} tone="shortage" icon="📥" />
        <StatCard label="Dispatched" value={totals.dispatched.toLocaleString()} tone="good" icon="📤" />
        <StatCard label="Pending" value={pending} tone="warn" icon="⏳" />
      </div>

      <Card>
        <CardHeader title="Accessory Breakdown" subtitle={`Every accessory required on ${orderLabel}, with its running balance at each stage.`} />
        <CardBody>
          <div className="overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                  {["Accessory", "Unit", "Required", "Purchased", "Bal. to Purchase", "Inward", "Bal. to Inward", "Dispatched", "Bal. to Dispatch", "Status"].map((h) => (
                    <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, rowIdx) => (
                  <tr key={r.raw.id}>
                    <td className={`${cellBase} font-semibold text-ink-900 ${cellShade(rowIdx, 0)}`}>{r.raw.name}</td>
                    <td className={`${cellBase} text-ink-500 ${cellShade(rowIdx, 1)}`}>{r.raw.unit}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 2)}`}>{r.flow.totals.required.toLocaleString()}</td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 3)}`}>{r.flow.totals.purchased.toLocaleString()}</td>
                    <td className={`${cellNum} ${r.flow.balanceToPurchase > 0 ? "text-amber-600 font-semibold" : "text-status-good"} ${cellShade(rowIdx, 4)}`}>
                      {r.flow.balanceToPurchase.toLocaleString()}
                    </td>
                    <td className={`${cellNum} ${cellShade(rowIdx, 5)}`}>{r.flow.totals.inward.toLocaleString()}</td>
                    <td className={`${cellNum} ${r.flow.balanceToInward > 0 ? "text-amber-600 font-semibold" : "text-status-good"} ${cellShade(rowIdx, 6)}`}>
                      {r.flow.balanceToInward.toLocaleString()}
                    </td>
                    <td className={`${cellNum} text-status-good ${cellShade(rowIdx, 7)}`}>{r.flow.totals.dispatched.toLocaleString()}</td>
                    <td className={`${cellNum} ${r.flow.balanceToDispatch > 0 ? "text-amber-600 font-semibold" : "text-status-good"} ${cellShade(rowIdx, 8)}`}>
                      {r.flow.balanceToDispatch.toLocaleString()}
                    </td>
                    <td className={`${cellBase} text-right ${cellShade(rowIdx, 9)}`}>
                      <Badge tone={BUCKET_TONE[r.bucket]}>{BUCKET_LABEL[r.bucket]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                  <td className={`${cellBase} border-l-4 border-l-blue-600 text-blue-900`} colSpan={2}>
                    Total
                  </td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(rows, (r) => r.flow.totals.required).toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(rows, (r) => r.flow.totals.purchased).toLocaleString()}</td>
                  <td className={cellNum} />
                  <td className={`${cellNum} text-blue-900`}>{sumBy(rows, (r) => r.flow.totals.inward).toLocaleString()}</td>
                  <td className={cellNum} />
                  <td className={`${cellNum} text-emerald-700`}>{sumBy(rows, (r) => r.flow.totals.dispatched).toLocaleString()}</td>
                  <td className={cellNum} />
                  <td className={cellBase} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Entry History" subtitle="Every purchase, inward and dispatch movement recorded against this order's accessories - newest first." />
        <CardBody>
          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">No entries recorded yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Accessory</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2 text-left font-semibold">Vendor / Sent To</th>
                    <th className="px-3 py-2 text-left font-semibold">DC Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {entries.map(({ entry, name, unit }) => (
                    <tr key={entry.id} className="bg-white">
                      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{formatDisplayDate(entry.entryDate)}</td>
                      <td className="px-3 py-2 font-semibold text-ink-900">{name}</td>
                      <td className="px-3 py-2">
                        <Badge tone={entry.entryType === "dispatch" ? "good" : entry.entryType === "inward" ? "info" : "warn"}>{entry.entryType}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {entry.qty.toLocaleString()} {unit}
                      </td>
                      <td className="px-3 py-2 text-ink-600">{(entry.entryType === "dispatch" ? entry.sentTo : entry.vendor) ?? "-"}</td>
                      <td className="px-3 py-2 text-ink-600">{entry.docNo ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}
