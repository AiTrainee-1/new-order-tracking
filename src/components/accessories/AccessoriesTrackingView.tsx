"use client";

import { useMemo, useState } from "react";
import { useAccessoriesSummary, type AccessorySummaryRow } from "@/hooks/useAccessoriesSummary";
import { buildAccessoryFlow, type AccessoryFlow } from "@/lib/accessories";
import { formatDisplayDate } from "@/lib/workflow";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { Input } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, type CardStatusTone } from "@/lib/theme";

/**
 * Accessories Management/Tracking - shared verbatim between /admin/accessories
 * and /md/accessories, the same "one component, two thin page wrappers"
 * pattern OutputView uses. Deliberately kept to two things per the product
 * ask: a searchable grid of order cards (click one to drill into that
 * order's full accessory detail) and the cross-order Accessories Stage
 * Matrix - see OrderAccessoriesDetail below and OutputView.tsx's own Stage
 * Matrix for the skin this one matches.
 */

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

export function AccessoriesTrackingView() {
  const { data, isLoading, isError } = useAccessoriesSummary();
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return data.map((r) => {
      const flow = buildAccessoryFlow(r, r.entries);
      return { raw: r, flow, bucket: bucketOf(flow) };
    });
  }, [data]);

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

  const matchesSearch = (o: { ioNo: string; style: string; color: string | null }, q: string) =>
    o.ioNo.toLowerCase().includes(q) || o.style.toLowerCase().includes(q) || (o.color?.toLowerCase().includes(q) ?? false);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => matchesSearch(o, q));
  }, [orders, search]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => matchesSearch(r.raw.order, q) || r.raw.name.toLowerCase().includes(q));
  }, [rows, search]);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

  if (isLoading) return <Loader full label="Loading the accessories tracker…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load the accessories summary.</p>;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Accessories Management</h1>
        <p className="text-sm text-ink-500">Every accessory tracked across every order - Required → Purchase → Inward → Dispatch.</p>
      </div>

      <Input
        placeholder="Search by IO number, style, or color…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="sm:max-w-sm"
      />

      {/* ============================== ORDERS =============================== */}
      {filteredOrders.length === 0 ? (
        <Card>
          <CardBody>
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">
              {orders.length === 0 ? "No accessories tracked on any order yet." : "No orders match this search."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((o) => (
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
                  {["Order", "Accessory", "Required", "Purchased", "Inward", "Dispatched", "Status"].map((h) => (
                    <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, rowIdx) => (
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
                    Total ({filteredRows.length} shown)
                  </td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(filteredRows, (r) => r.flow.totals.required).toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(filteredRows, (r) => r.flow.totals.purchased).toLocaleString()}</td>
                  <td className={`${cellNum} text-blue-900`}>{sumBy(filteredRows, (r) => r.flow.totals.inward).toLocaleString()}</td>
                  <td className={`${cellNum} text-emerald-700`}>{sumBy(filteredRows, (r) => r.flow.totals.dispatched).toLocaleString()}</td>
                  <td className={cellBase} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order card - one per order, click to drill into its accessories.
// ---------------------------------------------------------------------------

function AccessoryOrderCard({ order, onClick }: { order: OrderGroup; onClick: () => void }) {
  const tone = orderCardTone(order.rows);
  const complete = order.rows.filter((r) => r.bucket === "complete").length;
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
      className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cardStatusAccent[tone] }} />

      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-2 ring-inset" style={{ boxShadow: `inset 0 0 0 2px ${cardStatusAccent[tone]}33` }}>
          <GarmentPlaceholder className="h-6 w-6 text-ink-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{order.style}</p>
          <p className="truncate text-xs text-ink-600">
            IO {order.ioNo} {order.color ? `· ${order.color}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: cardStatusAccent[tone] }}>
          {complete}/{order.rows.length} done
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-white/80 bg-white/70 px-2.5 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Required</p>
          <p className="font-bold tabular-nums text-ink-900">{totals.required.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-white/80 bg-white/70 px-2.5 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Dispatched</p>
          <p className="font-bold tabular-nums text-status-good">{totals.dispatched.toLocaleString()}</p>
        </div>
      </div>

      <p className="text-xs text-ink-600">
        {order.rows.length} accessor{order.rows.length === 1 ? "y" : "ies"} tracked - click to view full detail
      </p>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">{orderLabel}</h1>
        <p className="text-sm text-ink-500">Accessories - Required → Purchase → Inward → Dispatch.</p>
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
                      <td className="px-3 py-2.5 font-semibold text-ink-900">{name}</td>
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

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}
