"use client";

import { useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import type { OrderListRow } from "@/hooks/useOrdersList";
import { bucketOfOrder, ORDER_BUCKETS, orderMatchesSearch, type OrderBucket } from "@/lib/orderList";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { FilterBar, FilterSummary, type FilterChip } from "@/components/ui/FilterBar";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Loader } from "@/components/ui/Loader";
import { SearchInput } from "@/components/ui/SearchInput";
import { ManageOrderCard } from "@/components/orders/ManageOrderCard";
import { OrdersOverview } from "@/components/orders/OrdersOverview";

type OrderFilter = "all" | OrderBucket;

/**
 * "Your orders" for a floor user who may create orders: the same overview,
 * filter bar and order cards the Admin Orders page uses, scoped to the orders
 * they created. Production figures and the Track link are left off - those
 * belong to the Admin/MD reports - so each card is delivery status, size and
 * the Edit / Hide / Delete actions.
 */
export function MyOrdersPanel({
  orders,
  isLoading,
  onToggleHidden,
  onDelete,
  hidePending,
  deletePending,
  onCreateFirst,
}: {
  orders: OrderListRow[];
  isLoading: boolean;
  onToggleHidden: (order: OrderListRow) => void;
  onDelete: (order: OrderListRow) => void;
  hidePending?: boolean;
  deletePending?: boolean;
  /** Switches back to the "new order" form - the empty state's call to action. */
  onCreateFirst: () => void;
}) {
  const { appUser } = useAuth();
  const who = appUser?.id ?? "anon";
  // Kept for the life of the browser tab, so coming back from an order's Edit
  // page lands on the same search and filter.
  const [search, setSearch] = usePersistedState(`ot:my-orders:${who}:search`, "");
  const [filter, setFilter] = usePersistedState<OrderFilter>(`ot:my-orders:${who}:filter`, "all", (v) => v === "all" || ORDER_BUCKETS.some((b) => b.key === v));
  const resultsRef = useRef<HTMLDivElement>(null);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? orders.filter((o) => orderMatchesSearch(o, q)) : orders;
  }, [orders, search]);

  const counts = useMemo(() => {
    const next: Record<OrderFilter, number> = { all: searched.length, on_track: 0, due_soon: 0, overdue: 0, no_date: 0, hidden: 0 };
    for (const o of searched) next[bucketOfOrder(o)]++;
    return next;
  }, [searched]);

  const visible = useMemo(() => (filter === "all" ? searched : searched.filter((o) => bucketOfOrder(o) === filter)), [searched, filter]);

  function selectBucket(bucket: OrderBucket) {
    const next = filter === bucket ? "all" : bucket;
    setFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (isLoading) return <Loader label="Loading your orders…" />;

  if (orders.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-2xl shadow-[0_12px_30px_-8px_rgba(21,94,239,0.45)]">📦</span>
        <p className="text-sm font-semibold text-ink-800">You haven&apos;t created any orders yet</p>
        <p className="max-w-sm text-sm text-ink-500">Orders you create show up here, where you can edit, hide or delete them.</p>
        <Button size="sm" onClick={onCreateFirst}>
          + Create your first order
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <OrdersOverview orders={orders} activeBucket={filter === "all" ? null : filter} onSelectBucket={selectBucket} />

      <div ref={resultsRef} className="scroll-mt-6 space-y-6">
        <FilterBar
          search={<SearchInput label="Find an order" placeholder="Type a style, IO number, buyer, color, or PO…" value={search} onChange={(e) => setSearch(e.target.value)} />}
          tabs={
            <FilterTabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { key: "all", label: "All", count: counts.all },
                { key: "overdue", label: "Overdue", count: counts.overdue, tone: "bad" },
                { key: "due_soon", label: "Due Soon", count: counts.due_soon, tone: "warn" },
                { key: "on_track", label: "On Track", count: counts.on_track, tone: "good" },
                ...(counts.no_date > 0 || filter === "no_date" ? [{ key: "no_date" as const, label: "No Date", count: counts.no_date, tone: "neutral" as const }] : []),
                { key: "hidden", label: "Hidden", count: counts.hidden, tone: "neutral" },
              ]}
            />
          }
          footer={
            <FilterSummary
              shown={visible.length}
              total={orders.length}
              noun="orders"
              chips={[search.trim() && { key: "search", label: `“${search.trim()}”`, onRemove: () => setSearch("") }].filter(Boolean) as FilterChip[]}
              onClear={search.trim() || filter !== "all" ? () => { setSearch(""); setFilter("all"); } : undefined}
            />
          }
        />

        {visible.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-6 text-center text-sm text-ink-500">{search.trim() ? "No orders match this search." : "No orders in this category."}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-5">
            {visible.map((order) => (
              <ManageOrderCard
                key={order.id}
                order={order}
                basePath="/user"
                showProduction={false}
                showTrack={false}
                onToggleHidden={onToggleHidden}
                onDelete={onDelete}
                hidePending={hidePending}
                deletePending={deletePending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
