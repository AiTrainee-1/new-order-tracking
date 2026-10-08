"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import { useAllOrderProgress } from "@/hooks/useOrders";
import { useOrderSummaries } from "@/hooks/useOrderSummaries";
import { useBuyers } from "@/hooks/useBuyers";
import { sumSummaries } from "@/lib/orderSummary";
import { isInProgress, matchesOrderFilter, type OrderFilter } from "@/lib/dashboard";
import { Card, CardBody } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { FilterBar, FilterSummary, type FilterChip } from "@/components/ui/FilterBar";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { matchesBuyer } from "@/lib/buyers";
import { OrderCard } from "@/components/dashboard/OrderCard";
import { ProductionPositionCard } from "@/components/orders/OrderProductionStrip";

const FILTER_KEYS: OrderFilter[] = ["all", "started", "on_track", "due_soon", "delayed", "not_started", "completed"];

/**
 * Production Output & Reports - order picker, shared verbatim between
 * /admin/output and /md/output (same "one component, two thin page
 * wrappers" pattern OutputView.tsx itself already uses for the per-order
 * report). Output only ever existed at /output/[orderId] - this is the
 * landing page that lets someone find that order without already knowing
 * its id, the same way Dashboard's order grid does, just linking into the
 * Output report instead of the order detail page.
 *
 * Every card carries the order's production position (ordered, cut, sewn,
 * packed, rejected, in rework, balance) so the right report can be picked
 * without opening each one, and the figures above the list add up whichever
 * orders the search and filters leave showing.
 */
export function OutputLandingView() {
  const { bundles, isLoading, isError } = useAllOrderProgress();
  const { byOrder: summaries } = useOrderSummaries();
  const { data: buyers = [] } = useBuyers();
  // Kept for the life of the browser tab, so coming back from an order's output
  // report lands on the same search.
  const { appUser } = useAuth();
  const who = appUser?.id ?? "anon";
  const [search, setSearch] = usePersistedState(`ot:output:${who}:search`, "");
  const [buyerId, setBuyerId] = usePersistedState(`ot:output:${who}:buyer`, "");
  const [filter, setFilter] = usePersistedState<OrderFilter>(`ot:output:${who}:filter`, "all", (v) => FILTER_KEYS.includes(v as OrderFilter));

  // Search and buyer narrow the pool first; the status tabs (and their counts)
  // then operate on whatever they left behind - same as the dashboard.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bundles.filter(
      (b) =>
        matchesBuyer(b.order, buyerId) &&
        (!q ||
          b.order.ioNo.toLowerCase().includes(q) ||
          b.order.style.toLowerCase().includes(q) ||
          (b.order.color?.toLowerCase().includes(q) ?? false) ||
          (b.order.buyer?.name.toLowerCase().includes(q) ?? false) ||
          b.purchaseOrders.some((po) => po.poNumber.toLowerCase().includes(q))),
    );
  }, [bundles, search, buyerId]);

  const counts = useMemo(() => {
    const next: Record<OrderFilter, number> = { all: searched.length, started: 0, on_track: 0, due_soon: 0, delayed: 0, not_started: 0, completed: 0 };
    for (const b of searched) {
      next[b.progress.status]++;
      if (isInProgress(b)) next.started++;
    }
    return next;
  }, [searched]);

  const filtered = useMemo(() => searched.filter((b) => matchesOrderFilter(b, filter)), [searched, filter]);
  const totals = useMemo(() => sumSummaries(filtered.flatMap((b) => (summaries.get(b.order.id) ? [summaries.get(b.order.id)!] : []))), [filtered, summaries]);

  if (isLoading) return <Loader full label="Loading orders…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load orders. Check the database connection.</p>;

  const anyFilter = filter !== "all" || search.trim() !== "" || buyerId !== "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Production Output & Reports</h1>
        <p className="text-sm text-ink-500">Every order&apos;s production position at a glance - pick one to open its full output report: KPIs, Stage Matrix, Size Matrix, Accessories, and every chart.</p>
      </div>

      <ProductionPositionCard totals={totals} subtitle={`Across the ${totals.orders.toLocaleString()} order${totals.orders === 1 ? "" : "s"} showing below · PCS`} />

      <FilterBar
        search={<SearchInput label="Find an order" placeholder="Type an IO number, style, buyer, color, or PO…" value={search} onChange={(e) => setSearch(e.target.value)} />}
        filters={<BuyerFilter value={buyerId} onChange={setBuyerId} />}
        tabs={
          <FilterTabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: "all", label: "All", count: counts.all },
              { key: "started", label: "Started", count: counts.started, tone: "info" },
              { key: "on_track", label: "On Track", count: counts.on_track, tone: "good" },
              { key: "due_soon", label: "Due Soon", count: counts.due_soon, tone: "warn" },
              { key: "delayed", label: "Delayed", count: counts.delayed, tone: "bad" },
              { key: "not_started", label: "Not Started", count: counts.not_started, tone: "neutral" },
              { key: "completed", label: "Completed", count: counts.completed, tone: "good" },
            ]}
          />
        }
        footer={
          <FilterSummary
            shown={filtered.length}
            total={bundles.length}
            noun="orders"
            chips={
              [
                buyerId && { key: "buyer", label: `Buyer: ${buyers.find((b) => b.id === buyerId)?.name ?? "…"}`, onRemove: () => setBuyerId("") },
                search.trim() && { key: "search", label: `“${search.trim()}”`, onRemove: () => setSearch("") },
              ].filter(Boolean) as FilterChip[]
            }
            onClear={
              anyFilter
                ? () => {
                    setSearch("");
                    setBuyerId("");
                    setFilter("all");
                  }
                : undefined
            }
          />
        }
      />

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">{bundles.length === 0 ? "No orders yet." : "No orders match this search."}</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((bundle) => (
            <OrderCard key={bundle.order.id} bundle={bundle} summary={summaries.get(bundle.order.id)} ctaLabel="Open output report →" linkTo={(basePath, orderId) => `${basePath}/output/${orderId}`} />
          ))}
        </div>
      )}
    </div>
  );
}
