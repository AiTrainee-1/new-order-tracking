"use client";

import { useMemo, useState } from "react";
import type { TrackingOrder } from "@/lib/trackingHistory";
import { TRACKING_STATUS_LABEL, entriesInRange, shortDateTime, stagesUpdatedInRange } from "@/lib/trackingHistory";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { matchesBuyer } from "@/lib/buyers";
import { Card } from "@/components/ui/Card";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Select } from "@/components/ui/FormControls";

type ActivityFilter = "all" | "updated" | "none";
const STATUS_PILL: Record<"completed" | "in_progress" | "not_started", string> = {
  completed: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-amber-100 text-amber-700",
  not_started: "bg-slate-100 text-slate-500",
};

export interface FinalOrderFilterState {
  buyerId: string;
  ioNo: string;
  activity: ActivityFilter;
}
export const EMPTY_FINAL_ORDER_FILTERS: FinalOrderFilterState = { buyerId: "", ioNo: "", activity: "all" };

export function finalOrderDescribeFilters(f: FinalOrderFilterState): string {
  return `Buyer: ${f.buyerId ? "Selected buyer" : "All"} · IO / No: ${f.ioNo || "All"}${f.activity === "all" ? "" : ` · Showing: ${f.activity === "updated" ? "orders with updates" : "orders with no updates"}`}`;
}

export function applyFinalOrderFilters(orders: TrackingOrder[], f: FinalOrderFilterState): TrackingOrder[] {
  return orders
    .filter((o) => matchesBuyer(o, f.buyerId) && (!f.ioNo || o.ioNo === f.ioNo) && (f.activity === "all" || (f.activity === "updated") === entriesInRange(o) > 0))
    .sort((a, b) => entriesInRange(b) - entriesInRange(a));
}

export function FinalOrderPanel({ allOrders, filters, onFilters }: { allOrders: TrackingOrder[]; filters: FinalOrderFilterState; onFilters: (f: FinalOrderFilterState) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const ioOptions = useMemo(
    () => Array.from(new Set(allOrders.filter((o) => !filters.buyerId || o.buyer?.id === filters.buyerId).map((o) => o.ioNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [allOrders, filters.buyerId],
  );
  const visible = useMemo(() => applyFinalOrderFilters(allOrders, filters), [allOrders, filters]);
  const counts = useMemo(() => {
    const updated = allOrders.filter((o) => matchesBuyer(o, filters.buyerId) && (!filters.ioNo || o.ioNo === filters.ioNo) && entriesInRange(o) > 0).length;
    const scoped = allOrders.filter((o) => matchesBuyer(o, filters.buyerId) && (!filters.ioNo || o.ioNo === filters.ioNo)).length;
    return { all: scoped, updated, none: scoped - updated };
  }, [allOrders, filters.buyerId, filters.ioNo]);

  function pickBuyer(buyerId: string) {
    onFilters({ ...filters, buyerId, ioNo: filters.ioNo && !allOrders.some((o) => o.ioNo === filters.ioNo && (!buyerId || o.buyer?.id === buyerId)) ? "" : filters.ioNo });
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <BuyerFilter value={filters.buyerId} onChange={pickBuyer} />
          <Select label="IO / No" value={filters.ioNo} onChange={(e) => onFilters({ ...filters, ioNo: e.target.value })}>
            <option value="">All IO numbers</option>
            {ioOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            value={filters.activity}
            onChange={(activity) => onFilters({ ...filters, activity })}
            tabs={[
              { key: "all", label: "All orders", count: counts.all },
              { key: "updated", label: "With updates", count: counts.updated },
              { key: "none", label: "No updates", count: counts.none },
            ]}
          />
          <div className="flex gap-3 text-xs">
            <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setCollapsed(new Set())}>
              Expand all
            </button>
            <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setCollapsed(new Set(visible.map((o) => o.id)))}>
              Collapse all
            </button>
          </div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-sm text-ink-500">{allOrders.length === 0 ? "No orders yet." : "No orders match these filters."}</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((order) => (
            <OrderHistoryCard key={order.id} order={order} open={!collapsed.has(order.id)} onToggle={() => toggle(order.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderHistoryCard({ order, open, onToggle }: { order: TrackingOrder; open: boolean; onToggle: () => void }) {
  const total = entriesInRange(order);
  const updated = stagesUpdatedInRange(order);
  const notStarted = order.stages.filter((s) => s.status === "not_started").length;

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 bg-gradient-to-r from-indigo-50/80 to-white px-4 py-3 text-left" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-ink-900">
            IO {order.ioNo} <span className="font-semibold text-ink-500">·</span> {order.style}
          </p>
          <p className="truncate text-xs text-ink-600">
            Buyer: <b className="font-semibold text-ink-800">{order.buyer?.name ?? "-"}</b> · Delivery: {order.deliveryDate ?? "-"}
            {order.color ? ` · ${order.color}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-bold ${total > 0 ? "bg-brand text-white" : "bg-slate-200 text-slate-500"}`}>
            {total} {total === 1 ? "entry" : "entries"}
          </span>
          <span className="text-ink-500">
            {updated}/{order.stages.length} stages updated · {notStarted} not started
          </span>
          <span className="text-ink-400" aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 text-left font-semibold">Stage</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Entries In Range</th>
                <th className="px-3 py-2 text-right font-semibold">Total Entries</th>
                <th className="px-4 py-2 text-left font-semibold">Last Entry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {order.stages.map((s) => (
                <tr key={s.sectionId} className={s.entries > 0 ? "bg-sky-50/50" : "bg-white"}>
                  <td className="px-4 py-2 font-medium text-ink-900">
                    <span className="mr-2 inline-block w-5 text-right text-xs font-bold text-ink-400">{s.seq}</span>
                    {s.label}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_PILL[s.status]}`}>{TRACKING_STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${s.entries > 0 ? "font-bold text-brand" : "text-ink-400"}`}>{s.entries}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-600">{s.totalEntries}</td>
                  <td className="px-4 py-2 text-ink-500">{shortDateTime(s.lastEntryAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
