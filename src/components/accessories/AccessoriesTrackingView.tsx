"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useAccessoriesSummary, type AccessorySummaryRow } from "@/hooks/useAccessoriesSummary";
import {
  ACCESSORY_STAGE_META,
  accessoryStageBucket,
  buildAccessoryFleetStats,
  buildAccessoryFlow,
  type AccessoryFlow,
  type AccessoryStageBucket,
} from "@/lib/accessories";
import { buildCsv, datedCsvName, downloadCsv } from "@/lib/csv";
import { AccessorySizeBreakdownRow, SizeBreakdownChips } from "@/components/accessories/AccessorySizeBreakdown";
import { formatDisplayDate } from "@/lib/workflow";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { Button } from "@/components/ui/Button";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { HealthOverviewCard, SummaryCard } from "@/components/ui/OverviewCards";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, type CardStatusTone } from "@/lib/theme";

/**
 * Accessories Management/Tracking - shared verbatim between /admin/accessories
 * and /md/accessories, the same "one component, two thin page wrappers"
 * pattern OutputView uses. An overview of where every accessory stands, a
 * searchable grid of order cards (click one to drill into that order's full
 * accessory detail) and the cross-order Accessories Stage Matrix - see
 * OrderAccessoriesDetail below and OutputView.tsx's own Stage Matrix for the
 * skin the matrix matches.
 */

function cellShade(rowIdx: number, colIdx: number): string {
  return (rowIdx + colIdx) % 2 === 0 ? "bg-white" : "bg-slate-50";
}
const cellBase = "border border-ink-200 px-3 py-2 text-sm";
const cellNum = `${cellBase} text-right font-mono tabular-nums`;

const BUCKET_LABEL: Record<AccessoryStageBucket, string> = Object.fromEntries(ACCESSORY_STAGE_META.map((s) => [s.key, s.label])) as Record<AccessoryStageBucket, string>;
const BUCKET_COLOR: Record<AccessoryStageBucket, string> = Object.fromEntries(ACCESSORY_STAGE_META.map((s) => [s.key, s.color])) as Record<AccessoryStageBucket, string>;

const BUCKET_TONE: Record<AccessoryStageBucket, "neutral" | "warn" | "info" | "good"> = {
  pending: "neutral",
  purchase: "warn",
  inward: "info",
  complete: "good",
};

type StageFilter = "all" | AccessoryStageBucket;

interface Row {
  raw: AccessorySummaryRow;
  flow: AccessoryFlow;
  bucket: AccessoryStageBucket;
}

interface OrderGroup {
  id: string;
  ioNo: string;
  style: string;
  color: string | null;
  rows: Row[];
}

/** notStarted/started/completed/yourTurn - the same 4-tone language every
 *  other order card in the app uses (Dashboard's OrderCard, Data Input). */
function orderCardTone(rows: Row[]): CardStatusTone {
  if (rows.every((r) => r.bucket === "complete")) return "completed";
  if (rows.every((r) => r.bucket === "pending")) return "notStarted";
  return "started";
}

/** The overview's segments for a set of rows, furthest along first. */
function stageSegments(rows: Row[]): HealthSegment[] {
  return ACCESSORY_STAGE_META.map((s) => ({ ...s, count: rows.filter((r) => r.bucket === s.key).length }));
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

export function AccessoriesTrackingView() {
  const { data, isLoading, isError } = useAccessoriesSummary();

  if (isLoading) return <Loader full label="Loading the accessories tracker…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load the accessories summary.</p>;

  return <AccessoriesContent data={data ?? []} />;
}

/** The page itself, given its data - split from the hook wrapper so the
 *  layout can be rendered without the fetch. */
export function AccessoriesContent({ data }: { data: AccessorySummaryRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StageFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(
    () =>
      data.map((r) => {
        const flow = buildAccessoryFlow(r, r.entries);
        return { raw: r, flow, bucket: accessoryStageBucket(flow) };
      }),
    [data],
  );

  const orders = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, OrderGroup>();
    for (const r of rows) {
      const o = r.raw.order;
      const group = map.get(o.id) ?? { id: o.id, ioNo: o.ioNo, style: o.style, color: o.color, rows: [] };
      group.rows.push(r);
      map.set(o.id, group);
    }
    return Array.from(map.values()).sort((a, b) => a.ioNo.localeCompare(b.ioNo));
  }, [rows]);

  // The overview always describes every accessory, not whatever the search
  // and stage filter below happen to be showing.
  const stats = useMemo(() => buildAccessoryFleetStats(data), [data]);
  const unitCounts = useMemo(() => {
    const byUnit = new Map<string, number>();
    for (const r of data) byUnit.set(r.unit, (byUnit.get(r.unit) ?? 0) + 1);
    return [...byUnit.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data]);

  // Search narrows the pool first (an order's IO/style/colour, or an
  // accessory's own name); the stage tabs and their counts then operate on
  // whatever it left behind.
  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const o = r.raw.order;
      return o.ioNo.toLowerCase().includes(q) || o.style.toLowerCase().includes(q) || (o.color?.toLowerCase().includes(q) ?? false) || r.raw.name.toLowerCase().includes(q);
    });
  }, [rows, search]);

  const counts = useMemo(() => {
    const next: Record<StageFilter, number> = { all: searchedRows.length, pending: 0, purchase: 0, inward: 0, complete: 0 };
    for (const r of searchedRows) next[r.bucket]++;
    return next;
  }, [searchedRows]);

  const visibleRows = useMemo(() => (filter === "all" ? searchedRows : searchedRows.filter((r) => r.bucket === filter)), [searchedRows, filter]);
  const visibleOrders = useMemo(() => {
    const ids = new Set(visibleRows.map((r) => r.raw.order.id));
    return orders.filter((o) => ids.has(o.id));
  }, [orders, visibleRows]);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

  function selectStage(stage: AccessoryStageBucket) {
    const next = filter === stage ? "all" : stage;
    setFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function exportCsv() {
    const head = ["Order (IO)", "Style", "Accessory", "Unit", "Required", "Purchased", "Inward", "Dispatched", "Bal. to purchase", "Bal. to inward", "Bal. to dispatch", "Stage", "Size wise"];
    const body = visibleRows.map((r) => [
      r.raw.order.ioNo,
      r.raw.order.style,
      r.raw.name,
      r.raw.unit,
      r.flow.totals.required,
      r.flow.totals.purchased,
      r.flow.totals.inward,
      r.flow.totals.dispatched,
      r.flow.balanceToPurchase,
      r.flow.balanceToInward,
      r.flow.balanceToDispatch,
      BUCKET_LABEL[r.bucket],
      r.raw.sizeBreakdown ? "Yes" : "No",
    ]);
    downloadCsv(datedCsvName("accessories"), buildCsv(head, body));
  }

  if (selectedOrder) {
    return (
      <div className="space-y-6">
        <Button variant="secondary" size="sm" onClick={() => setSelectedOrderId("")}>
          ← All Orders
        </Button>
        <OrderAccessoriesDetail order={selectedOrder} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">No accessories tracked on any order yet.</p>
        </CardBody>
      </Card>
    );
  }

  const awaitingPurchase = stats.byStage.pending;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <HealthOverviewCard
          tone="amber"
          icon="🧷"
          title="Accessories at a glance"
          subtitle="Click a stage to see just those accessories."
          headlineLabel="Accessories tracked"
          headline={stats.total.toLocaleString()}
          badge={awaitingPurchase > 0 ? { tone: "warn", text: `${awaitingPurchase} awaiting purchase` } : { tone: "good", text: "Everything purchased" }}
          segments={stageSegments(rows)}
          total={stats.total}
          ariaLabel={`Accessories by stage: ${stageSegments(rows).map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}`}
          activeKey={filter === "all" ? null : filter}
          onSelect={(key) => selectStage(key as AccessoryStageBucket)}
          unitLabel="accessories"
        />

        <SummaryCard
          tone="violet"
          icon="📦"
          title="Orders covered"
          subtitle="Orders with accessories tracked."
          headline={stats.orders}
          headlineLabel="orders with accessories"
          tiles={[
            { label: "Size wise", value: stats.sizeWise },
            { label: "Units used", value: unitCounts.length },
          ]}
        >
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">By unit</p>
            <ul className="space-y-1.5">
              {unitCounts.slice(0, 4).map(([unit, count]) => (
                <li key={unit} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-600">{unit}</span>
                  <span className="font-bold tabular-nums text-ink-900">{count}</span>
                </li>
              ))}
              {unitCounts.length > 4 && <li className="text-[11px] text-ink-400">+ {unitCounts.length - 4} more</li>}
            </ul>
          </div>
        </SummaryCard>
      </div>

      <div ref={resultsRef} className="scroll-mt-6 space-y-6">
        <Card>
          <CardBody className="space-y-4">
            <SearchInput label="Find an order or accessory" placeholder="Type an IO number, style, color, or accessory name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <FilterTabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { key: "all", label: "All", count: counts.all },
                { key: "pending", label: "Pending", count: counts.pending },
                { key: "purchase", label: "Purchased", count: counts.purchase },
                { key: "inward", label: "Inward", count: counts.inward },
                { key: "complete", label: "Complete", count: counts.complete },
              ]}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span>
                  {visibleRows.length} of {rows.length} accessories · {visibleOrders.length} of {orders.length} orders
                </span>
                {(filter !== "all" || search.trim() !== "") && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setSearch("");
                    }}
                    className="font-semibold text-brand hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={exportCsv} disabled={visibleRows.length === 0}>
                Export CSV
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* ============================== ORDERS =============================== */}
        {visibleOrders.length === 0 ? (
          <Card>
            <CardBody>
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">No accessories match these filters.</p>
            </CardBody>
          </Card>
        ) : (
          // As many columns as fit at a comfortable card width - see
          // DashboardContent's grid for why this isn't a fixed count.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-5">
            {visibleOrders.map((o) => (
              <AccessoryOrderCard key={o.id} order={o} onClick={() => setSelectedOrderId(o.id)} />
            ))}
          </div>
        )}

        {/* ======================= ACCESSORIES STAGE MATRIX ==================== */}
        <Card>
          <CardHeader title="Accessories Stage Matrix" subtitle="Required → Purchase → Inward → Dispatch, per accessory - separate from the production Stage Matrix on the Output screen." />
          <CardBody>
            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                    {["Order", "Accessory", "Required", "Purchased", "Inward", "Dispatched", "Status"].map((h, i) => (
                      <th key={h} className={`border border-ink-800 px-3 py-2.5 font-semibold ${i < 2 ? "text-left" : "text-right"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, rowIdx) => (
                    <Fragment key={r.raw.id}>
                      <tr>
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
                      <AccessorySizeBreakdownRow flow={r.flow} unit={r.raw.unit} colSpan={7} />
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                    <td className={`${cellBase} border-l-4 border-l-blue-600 text-blue-900`} colSpan={2}>
                      Total ({visibleRows.length} shown)
                    </td>
                    <td className={`${cellNum} text-blue-900`}>{sumBy(visibleRows, (r) => r.flow.totals.required).toLocaleString()}</td>
                    <td className={`${cellNum} text-blue-900`}>{sumBy(visibleRows, (r) => r.flow.totals.purchased).toLocaleString()}</td>
                    <td className={`${cellNum} text-blue-900`}>{sumBy(visibleRows, (r) => r.flow.totals.inward).toLocaleString()}</td>
                    <td className={`${cellNum} text-emerald-700`}>{sumBy(visibleRows, (r) => r.flow.totals.dispatched).toLocaleString()}</td>
                    <td className={cellBase} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order card - one per order, click to drill into its accessories.
// ---------------------------------------------------------------------------

function AccessoryOrderCard({ order, onClick }: { order: OrderGroup; onClick: () => void }) {
  const tone = orderCardTone(order.rows);
  const accent = cardStatusAccent[tone];
  const complete = order.rows.filter((r) => r.bucket === "complete").length;
  const pct = Math.round((complete / order.rows.length) * 100);
  const sizeWiseCount = order.rows.filter((r) => r.raw.sizeBreakdown).length;
  const totals = order.rows.reduce(
    (acc, r) => ({
      required: acc.required + r.flow.totals.required,
      dispatched: acc.dispatched + r.flow.totals.dispatched,
    }),
    { required: 0, dispatched: 0 },
  );

  return (
    <button
      type="button"
      onClick={onClick}
      style={cardStatusSoftBg[tone]}
      className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-1 ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

      <div className="flex items-start gap-3.5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white" style={{ boxShadow: `inset 0 0 0 2px ${accent}33` }}>
          <GarmentPlaceholder className="h-8 w-8 text-ink-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold tracking-tight text-ink-900">{order.style}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-600">
            IO {order.ioNo}
            {order.color ? ` · ${order.color}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: accent }}>
          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
          {complete}/{order.rows.length} done
        </span>
      </div>

      {/* One segment per accessory, coloured by how far it has got - so the
          spread across Pending / Purchased / Inward / Complete reads at a glance. */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-ink-700">
            {complete}/{order.rows.length} accessories complete
          </span>
          <span className="text-lg font-extrabold tabular-nums" style={{ color: accent }}>
            {pct}%
          </span>
        </div>
        <div className="flex h-2.5 items-center gap-[3px]" role="img" aria-label={`${complete} of ${order.rows.length} accessories complete`}>
          {order.rows.map((r) => (
            <span
              key={r.raw.id}
              title={`${r.raw.name} - ${BUCKET_LABEL[r.bucket]}`}
              className="h-full min-w-[3px] flex-1 rounded-full"
              style={{ backgroundColor: r.bucket === "pending" ? "rgba(15,23,42,0.12)" : BUCKET_COLOR[r.bucket] }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Required</p>
          <p className="text-lg font-bold tabular-nums text-ink-900">{totals.required.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Dispatched</p>
          <p className="text-lg font-bold tabular-nums text-status-good">{totals.dispatched.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/10 pt-3 text-xs">
        <span className="text-ink-600">
          {order.rows.length} accessor{order.rows.length === 1 ? "y" : "ies"} tracked
          {sizeWiseCount > 0 && ` · ${sizeWiseCount} size wise`}
        </span>
        <span className="font-semibold text-brand">View detail →</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single-order drill-down - the individual view: every accessory for THIS
// order, with its own full entry ledger, no fleet-wide numbers mixed in.
// ---------------------------------------------------------------------------

function OrderAccessoriesDetail({ order }: { order: OrderGroup }) {
  const rows = order.rows;
  const orderLabel = `${order.ioNo} · ${order.style}`;

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

  const segments = stageSegments(rows);
  const pending = segments.find((s) => s.key === "pending")?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">{orderLabel}</h1>
        <p className="text-sm text-ink-500">Accessories - Required → Purchase → Inward → Dispatch.</p>
      </div>

      <HealthOverviewCard
        tone="amber"
        icon="🧷"
        title="This order's accessories"
        subtitle="How far each accessory on this order has got."
        headlineLabel="Accessories on this order"
        headline={rows.length}
        badge={pending > 0 ? { tone: "warn", text: `${pending} awaiting purchase` } : { tone: "good", text: "Everything purchased" }}
        segments={segments}
        total={rows.length}
        ariaLabel={`Accessories on ${orderLabel} by stage: ${segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}`}
        unitLabel="accessories"
      />

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
                  <Fragment key={r.raw.id}>
                    <tr>
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
                    <AccessorySizeBreakdownRow flow={r.flow} unit={r.raw.unit} colSpan={10} defaultOpen />
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                  <td className={`${cellBase} border-l-4 border-l-blue-600 text-blue-900`} colSpan={2}>
                    Total
                  </td>
                  <td className={`${cellNum} text-blue-900`}>{totals.required.toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{totals.purchased.toLocaleString()}</td>
                  <td className={cellNum} />
                  <td className={`${cellNum} text-blue-900`}>{totals.inward.toLocaleString()}</td>
                  <td className={cellNum} />
                  <td className={`${cellNum} text-emerald-700`}>{totals.dispatched.toLocaleString()}</td>
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
            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                    {["Date", "Accessory", "Type", "Qty", "Vendor / Sent To", "DC Name"].map((h) => (
                      <th key={h} className="border-b-2 border-ink-200 px-3 py-2.5 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {entries.map(({ entry, name, unit }, rowIdx) => (
                    <tr key={entry.id} className={cellShade(rowIdx, 0)}>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-500">{formatDisplayDate(entry.entryDate)}</td>
                      <td className="px-3 py-2.5 font-semibold text-ink-900">
                        {name}
                        <SizeBreakdownChips breakdown={entry.sizeBreakdown} unit={unit} />
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={entry.entryType === "dispatch" ? "good" : entry.entryType === "inward" ? "info" : "warn"}>{entry.entryType}</Badge>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {entry.qty.toLocaleString()} {unit}
                      </td>
                      <td className="px-3 py-2.5 text-ink-600">{(entry.entryType === "dispatch" ? entry.sentTo : entry.vendor) ?? "-"}</td>
                      <td className="px-3 py-2.5 text-ink-600">{entry.docNo ?? "-"}</td>
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
