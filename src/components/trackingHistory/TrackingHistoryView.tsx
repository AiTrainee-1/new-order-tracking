"use client";

import { useMemo, useState } from "react";
import { useTrackingHistory } from "@/hooks/useTrackingHistory";
import { useBuyers } from "@/hooks/useBuyers";
import { useToast } from "@/context/ToastContext";
import {
  DATE_PRESETS,
  TRACKING_STATUS_LABEL,
  entriesInRange,
  rangeLabel,
  resolveRange,
  shortDate,
  stagesUpdatedInRange,
  toDateKey,
  type DatePreset,
  type TrackingOrder,
  type TrackingStageStatus,
} from "@/lib/trackingHistory";
import { exportTrackingHistoryExcel, exportTrackingHistoryPng } from "@/lib/trackingHistoryExport";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Input, Select } from "@/components/ui/FormControls";
import { Loader } from "@/components/ui/Loader";
import { PageHero } from "@/components/ui/SectionCard";

type ActivityFilter = "all" | "updated" | "none";

const STATUS_PILL: Record<TrackingStageStatus, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-amber-100 text-amber-700",
  not_started: "bg-slate-100 text-slate-500",
};

/**
 * Tracking History - the admin's daily check on data entry. Pick a day (or a
 * range), optionally a buyer and/or an IO number, and see for every order
 * which of ITS OWN stages received entries, how many, and which stages are
 * still Not Yet Started. Numbers come from the real data-input records (see
 * GET /api/tracking-history), and the same filtered view exports to Excel or
 * a shareable PNG.
 */
export function TrackingHistoryView() {
  const toast = useToast();
  const { data: buyers = [] } = useBuyers();
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState(() => toDateKey(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateKey(new Date()));
  const [buyerId, setBuyerId] = useState("");
  const [ioNo, setIoNo] = useState("");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<"png" | "xlsx" | null>(null);

  const { from, to } = useMemo(() => resolveRange(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const { data, isLoading, isError, error, isFetching, refetch } = useTrackingHistory(from, to);

  const allOrders = useMemo(() => data?.orders ?? [], [data]);

  // The IO list follows the Buyer pick, so "H&M" only offers H&M's orders.
  const ioOptions = useMemo(
    () => Array.from(new Set(allOrders.filter((o) => !buyerId || o.buyer?.id === buyerId).map((o) => o.ioNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [allOrders, buyerId],
  );

  const scoped = useMemo(() => allOrders.filter((o) => (!buyerId || o.buyer?.id === buyerId) && (!ioNo || o.ioNo === ioNo)), [allOrders, buyerId, ioNo]);
  const counts = useMemo(() => {
    const updated = scoped.filter((o) => entriesInRange(o) > 0).length;
    return { all: scoped.length, updated, none: scoped.length - updated };
  }, [scoped]);
  const visible = useMemo(
    () =>
      scoped
        .filter((o) => (activity === "all" ? true : activity === "updated" ? entriesInRange(o) > 0 : entriesInRange(o) === 0))
        // Orders with the most activity first - the ones the admin asked about.
        .sort((a, b) => entriesInRange(b) - entriesInRange(a)),
    [scoped, activity],
  );

  const totalEntries = visible.reduce((sum, o) => sum + entriesInRange(o), 0);
  const stagesUpdated = visible.reduce((sum, o) => sum + stagesUpdatedInRange(o), 0);
  const anyFilter = buyerId !== "" || ioNo !== "" || activity !== "all";

  const filterSummary = `Buyer: ${buyers.find((b) => b.id === buyerId)?.name ?? "All"}   |   IO / No: ${ioNo || "All"}${activity === "all" ? "" : `   |   Showing: ${activity === "updated" ? "orders with updates" : "orders with no updates"}`}`;

  function pickBuyer(id: string) {
    setBuyerId(id);
    // An IO chosen under another buyer would silently show nothing.
    if (ioNo && !allOrders.some((o) => o.ioNo === ioNo && (!id || o.buyer?.id === id))) setIoNo("");
  }

  function clearFilters() {
    setBuyerId("");
    setIoNo("");
    setActivity("all");
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runExport(kind: "png" | "xlsx") {
    setExporting(kind);
    try {
      const ctx = { from, to, orders: visible, filterSummary };
      if (kind === "png") await exportTrackingHistoryPng(ctx);
      else await exportTrackingHistoryExcel(ctx);
      toast.success(kind === "png" ? "PNG downloaded." : "Excel file downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon="🕒"
        iconBg="linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)"
        title="Tracking History"
        titleGradient="linear-gradient(100deg, #0284C7 0%, #6366F1 60%, #9333EA 100%)"
        description="Daily order-tracking activity - which stages were updated, how many entries, and what hasn't started."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => runExport("png")} isLoading={exporting === "png"} disabled={isLoading || !!exporting}>
              Export PNG
            </Button>
            <Button onClick={() => runExport("xlsx")} isLoading={exporting === "xlsx"} disabled={isLoading || !!exporting}>
              Export Excel
            </Button>
          </div>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-600">Date</p>
            <FilterTabs value={preset} onChange={setPreset} tabs={DATE_PRESETS.map((p) => ({ key: p.key, label: p.label }))} />
            {preset === "custom" && (
              <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
                <Input label="From" type="date" value={customFrom} max={toDateKey(new Date())} onChange={(e) => setCustomFrom(e.target.value)} />
                <Input label="To" type="date" value={customTo} max={toDateKey(new Date())} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <BuyerFilter value={buyerId} onChange={pickBuyer} />
            <Select label="IO / No" value={ioNo} onChange={(e) => setIoNo(e.target.value)}>
              <option value="">All IO numbers</option>
              {ioOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <div className="flex items-end">
              {anyFilter && (
                <button type="button" onClick={clearFilters} className="pb-2.5 text-sm font-semibold text-brand hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterTabs
              value={activity}
              onChange={setActivity}
              tabs={[
                { key: "all", label: "All orders", count: counts.all },
                { key: "updated", label: "With updates", count: counts.updated },
                { key: "none", label: "No updates", count: counts.none },
              ]}
            />
            <div className="flex items-center gap-3 text-xs text-ink-500">
              <span className="font-semibold text-ink-700">{rangeLabel(from, to)}</span>
              <button type="button" onClick={() => refetch()} className="font-semibold text-brand hover:underline" disabled={isFetching}>
                {isFetching ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {isLoading && <Loader label="Loading tracking history…" />}
      {isError && <p className="text-sm text-status-bad">{error instanceof Error ? error.message : "Could not load Tracking History."}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Orders shown" value={visible.length} />
            <Kpi label="Orders updated" value={visible.filter((o) => entriesInRange(o) > 0).length} tone="good" />
            <Kpi label="Orders with no updates" value={visible.filter((o) => entriesInRange(o) === 0).length} tone={visible.some((o) => entriesInRange(o) === 0) ? "warn" : undefined} />
            <Kpi label="Entries in period" value={totalEntries} sub={`${stagesUpdated} stage update${stagesUpdated === 1 ? "" : "s"}`} />
          </div>

          {visible.length === 0 ? (
            <Card>
              <CardBody>
                <p className="py-6 text-center text-sm text-ink-500">{allOrders.length === 0 ? "No orders yet." : "No orders match these filters."}</p>
              </CardBody>
            </Card>
          ) : (
            <>
              <div className="flex justify-end gap-3 text-xs">
                <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setCollapsed(new Set())}>
                  Expand all
                </button>
                <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setCollapsed(new Set(visible.map((o) => o.id)))}>
                  Collapse all
                </button>
              </div>
              <div className="space-y-4">
                {visible.map((order) => (
                  <OrderHistoryCard key={order.id} order={order} from={from} to={to} open={!collapsed.has(order.id)} onToggle={() => toggle(order.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "good" | "warn" }) {
  const rail = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-brand";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/80 p-4 shadow-[0_8px_24px_-16px_rgba(30,41,90,0.4)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${rail}`} />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{value.toLocaleString()}</p>
      {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}

function OrderHistoryCard({ order, from, to, open, onToggle }: { order: TrackingOrder; from: string; to: string; open: boolean; onToggle: () => void }) {
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
            Buyer: <b className="font-semibold text-ink-800">{order.buyer?.name ?? "-"}</b> · Delivery: {shortDate(order.deliveryDate)}
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
                <th className="px-3 py-2 text-right font-semibold">Entries ({from === to ? shortDate(from) : "period"})</th>
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
                  <td className="px-4 py-2 text-ink-500">{shortDate(s.lastEntryDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
