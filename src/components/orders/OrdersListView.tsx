"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { OrderListRow } from "@/hooks/useOrdersList";
import { bucketOfOrder, orderMatchesSearch, type OrderBucket } from "@/lib/orderList";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Loader } from "@/components/ui/Loader";
import { SearchInput } from "@/components/ui/SearchInput";
import { PageHero } from "@/components/ui/SectionCard";
import { ManageOrderCard } from "@/components/orders/ManageOrderCard";
import { OrdersOverview } from "@/components/orders/OrdersOverview";

type OrderFilter = "all" | OrderBucket;

/** The Orders page, given its data and actions - split from the route so the
 *  layout can be rendered without the orders fetch or the mutations. */
export function OrdersListView({
  orders,
  isLoading,
  onToggleHidden,
  onDelete,
  hidePending,
  deletePending,
}: {
  orders: OrderListRow[] | undefined;
  isLoading: boolean;
  onToggleHidden: (order: OrderListRow) => void;
  onDelete: (order: OrderListRow) => void;
  hidePending?: boolean;
  deletePending?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const resultsRef = useRef<HTMLDivElement>(null);

  // Search narrows the pool first; the tabs (and their counts) then operate
  // on whatever the search left behind - same as the dashboard.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!orders) return [];
    if (!q) return orders;
    return orders.filter((o) => orderMatchesSearch(o, q));
  }, [orders, search]);

  const counts = useMemo(() => {
    const next: Record<OrderFilter, number> = { all: searched.length, on_track: 0, due_soon: 0, overdue: 0, no_date: 0, hidden: 0 };
    for (const o of searched) next[bucketOfOrder(o)]++;
    return next;
  }, [searched]);

  const visible = useMemo(() => (filter === "all" ? searched : searched.filter((o) => bucketOfOrder(o) === filter)), [searched, filter]);

  /** A click on the overview above should visibly do something - bring the
   *  list into view, and click the same one again to clear it. */
  function selectBucket(bucket: OrderBucket) {
    const next = filter === bucket ? "all" : bucket;
    setFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon="📦"
        iconBg="linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)"
        title="Orders"
        titleGradient="linear-gradient(100deg, #155EEF 0%, #7C3AED 60%, #DB2777 100%)"
        description="Every order, with its own configured stage plan."
        action={
          <Link href="/admin/orders/new" className="group">
            <Button className="gap-1.5">
              <span className="inline-block transition-transform duration-300 group-hover:rotate-90">+</span>
              Create Order
            </Button>
          </Link>
        }
      />

      {isLoading && <Loader label="Loading orders…" />}

      {orders && orders.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-2xl shadow-[0_12px_30px_-8px_rgba(21,94,239,0.45)]">📦</span>
          <p className="text-sm font-semibold text-ink-800">No orders yet</p>
          <p className="max-w-sm text-sm text-ink-500">Create the first one to try the dynamic, per-order stage plan.</p>
        </Card>
      )}

      {orders && orders.length > 0 && (
        <>
          <OrdersOverview orders={orders} activeBucket={filter === "all" ? null : filter} onSelectBucket={selectBucket} />

          <div ref={resultsRef} className="scroll-mt-6 space-y-6">
            <Card>
              <CardBody className="space-y-4">
                <SearchInput label="Find an order" placeholder="Type a style, IO number, color, or PO…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FilterTabs
                    value={filter}
                    onChange={setFilter}
                    tabs={[
                      { key: "all", label: "All", count: counts.all },
                      { key: "overdue", label: "Overdue", count: counts.overdue },
                      { key: "due_soon", label: "Due Soon", count: counts.due_soon },
                      { key: "on_track", label: "On Track", count: counts.on_track },
                      // Only worth a tab once an order actually has no date.
                      ...(counts.no_date > 0 || filter === "no_date" ? [{ key: "no_date" as const, label: "No Date", count: counts.no_date }] : []),
                      { key: "hidden", label: "Hidden", count: counts.hidden },
                    ]}
                  />
                  <span className="text-xs text-ink-500">
                    {visible.length} of {orders.length} orders
                  </span>
                </div>
              </CardBody>
            </Card>

            {visible.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="py-6 text-center text-sm text-ink-500">{search.trim() ? "No orders match this search." : "No orders in this category."}</p>
                </CardBody>
              </Card>
            ) : (
              // As many columns as fit at a comfortable card width - see
              // DashboardContent's grid for why this isn't a fixed count.
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-5">
                {visible.map((order) => (
                  <ManageOrderCard key={order.id} order={order} onToggleHidden={onToggleHidden} onDelete={onDelete} hidePending={hidePending} deletePending={deletePending} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
