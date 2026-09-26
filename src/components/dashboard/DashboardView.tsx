"use client";

import { useMemo, useRef, useState } from "react";
import { useAllOrderProgress, type OrderBundle } from "@/hooks/useOrders";
import { useAccessoriesSummary, type AccessorySummaryRow } from "@/hooks/useAccessoriesSummary";
import type { OrderStatus } from "@/lib/progress";
import { buildAccessoryFleetStats } from "@/lib/accessories";
import {
  buildStageCounts,
  currentStageLabel,
  exportOrdersCsv,
  isInProgress,
  matchesDashboardSearch,
  matchesOrderFilter,
  ORDER_SORTS,
  sortOrders,
  type OrderFilter,
  type OrderSort,
} from "@/lib/dashboard";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { matchesBuyer } from "@/lib/buyers";
import { Select } from "@/components/ui/FormControls";
import { DashboardOrderCard } from "@/components/dashboard/DashboardOrderCard";
import { FleetOverview } from "@/components/dashboard/FleetOverview";
import { AccessoriesSnapshot } from "@/components/dashboard/AccessoriesSnapshot";
import { StageDistribution } from "@/components/dashboard/StageDistribution";

export type AccessoriesState = "loading" | "error" | "ready";

/** Fleet dashboard - shared verbatim between /admin/dashboard and
 *  /md/dashboard (see orderTrackingBasePath's module comment). */
export function DashboardView() {
  const { bundles, isLoading, isError } = useAllOrderProgress();
  const accessories = useAccessoriesSummary();

  if (isLoading) return <Loader full label="Loading dashboard…" />;
  if (isError) {
    return <p className="text-sm text-status-bad">Couldn&apos;t load orders. Check the database connection.</p>;
  }

  return (
    <DashboardContent
      bundles={bundles}
      accessoryRows={accessories.data}
      accessoriesState={accessories.isLoading ? "loading" : accessories.isError ? "error" : "ready"}
    />
  );
}

/** The dashboard itself, given its data - split from DashboardView so the
 *  layout can be rendered without the orders/entries/accessories fetches. The
 *  accessories load separately and never hold the orders back. */
export function DashboardContent({
  bundles,
  accessoryRows,
  accessoriesState,
}: {
  bundles: OrderBundle[];
  accessoryRows: AccessorySummaryRow[] | undefined;
  accessoriesState: AccessoriesState;
}) {
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [sort, setSort] = useState<OrderSort>("priority");
  const resultsRef = useRef<HTMLDivElement>(null);

  // The overview always describes the whole fleet, not whatever the search
  // and filters below happen to be showing.
  const statusCounts = useMemo(() => {
    const next: Record<OrderStatus, number> = { not_started: 0, on_track: 0, due_soon: 0, delayed: 0, completed: 0 };
    for (const b of bundles) next[b.progress.status]++;
    return next;
  }, [bundles]);
  const stageCounts = useMemo(() => buildStageCounts(bundles), [bundles]);

  // Only accessories on orders that are on this dashboard - the summary
  // endpoint also returns hidden orders', which aren't in the totals above.
  const accessoryStats = useMemo(() => {
    if (!accessoryRows) return null;
    const onDashboard = new Set(bundles.map((b) => b.order.id));
    return buildAccessoryFleetStats(accessoryRows.filter((r) => onDashboard.has(r.order.id)));
  }, [accessoryRows, bundles]);

  // Search and the stage pick narrow the pool first; the status tabs (and
  // their counts) then operate on whatever they left behind.
  const pool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortOrders(bundles, sort).filter((b) => matchesBuyer(b.order, buyerId) && (!q || matchesDashboardSearch(b, q)) && (!stageFilter || (isInProgress(b) && currentStageLabel(b) === stageFilter)));
  }, [bundles, sort, search, stageFilter, buyerId]);

  const counts = useMemo(() => {
    const next: Record<OrderFilter, number> = { all: pool.length, started: 0, on_track: 0, due_soon: 0, delayed: 0, not_started: 0, completed: 0 };
    for (const b of pool) {
      next[b.progress.status]++;
      if (isInProgress(b)) next.started++;
    }
    return next;
  }, [pool]);

  const visible = useMemo(() => pool.filter((b) => matchesOrderFilter(b, filter)), [pool, filter]);

  const anyFilter = filter !== "all" || stageFilter !== null || search.trim() !== "" || buyerId !== "";

  /** The overview and stage cards sit above the list - bring the list into
   *  view so a click there visibly does something. */
  function revealResults() {
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function selectStatus(status: OrderStatus) {
    const next = filter === status ? "all" : status;
    setFilter(next);
    if (next !== "all") revealResults();
  }

  function selectStage(label: string) {
    const next = stageFilter === label ? null : label;
    setStageFilter(next);
    if (next) revealResults();
  }

  function clearFilters() {
    setFilter("all");
    setStageFilter(null);
    setSearch("");
    setBuyerId("");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <FleetOverview
          statusCounts={statusCounts}
          totalOrders={bundles.length}
          activeStatus={filter === "all" || filter === "started" ? null : filter}
          onSelectStatus={selectStatus}
        />
        <AccessoriesSnapshot stats={accessoryStats} status={accessoriesState} orderCount={bundles.length} />
      </div>

      <StageDistribution counts={stageCounts} activeStage={stageFilter} onSelect={selectStage} />

      <div ref={resultsRef} className="scroll-mt-6 space-y-6">
        <Card>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_14rem]">
              <SearchInput label="Find an order" placeholder="Type a style, IO number, color, PO, or stage…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <BuyerFilter value={buyerId} onChange={setBuyerId} />
              <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as OrderSort)}>
                {ORDER_SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>

            <FilterTabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { key: "all", label: "All", count: counts.all },
                { key: "started", label: "Started", count: counts.started },
                { key: "on_track", label: "On Track", count: counts.on_track },
                { key: "due_soon", label: "Due Soon", count: counts.due_soon },
                { key: "delayed", label: "Delayed", count: counts.delayed },
                { key: "not_started", label: "Not Started", count: counts.not_started },
                { key: "completed", label: "Completed", count: counts.completed },
              ]}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span>
                  {visible.length} of {bundles.length} orders
                </span>
                {stageFilter && (
                  <button
                    type="button"
                    onClick={() => setStageFilter(null)}
                    aria-label={`Remove the ${stageFilter} stage filter`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                  >
                    At {stageFilter}
                    <span aria-hidden>✕</span>
                  </button>
                )}
                {anyFilter && (
                  <button type="button" onClick={clearFilters} className="font-semibold text-brand hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={() => exportOrdersCsv(visible)} disabled={visible.length === 0}>
                Export CSV
              </Button>
            </div>
          </CardBody>
        </Card>

        {visible.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-6 text-center text-sm text-ink-500">{anyFilter ? "No orders match these filters." : "No orders yet."}</p>
            </CardBody>
          </Card>
        ) : (
          // As many columns as fit at a comfortable card width (the sidebar
          // eats a fixed 256px, so a fixed column count is too tight at laptop
          // widths); min() keeps one column from overflowing a narrow phone.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-5">
            {visible.map((bundle) => (
              <DashboardOrderCard key={bundle.order.id} bundle={bundle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
