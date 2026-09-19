"use client";

import { useMemo, useState } from "react";
import { useAllOrderProgress, type OrderBundle } from "@/hooks/useOrders";
import { buildFleetStats } from "@/lib/progress";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Input } from "@/components/ui/FormControls";
import { OrderCard } from "@/components/dashboard/OrderCard";
import { DeliveryReminderList } from "@/components/dashboard/DeliveryReminderList";

type OrderFilter = "all" | "started" | "not_started" | "completed";

/** Which bucket an order falls into for the sub-tabs and the sort order.
 * Lower rank sorts first: in-flight work is what needs attention, finished
 * orders drop to the bottom. */
function bucketOf(bundle: OrderBundle): Exclude<OrderFilter, "all"> {
  const { progress } = bundle;
  if (progress.status === "completed") return "completed";
  return progress.hasStarted ? "started" : "not_started";
}

const BUCKET_RANK: Record<Exclude<OrderFilter, "all">, number> = {
  started: 0,
  not_started: 1,
  completed: 2,
};

/** Fleet dashboard - shared verbatim between /admin/dashboard and
 *  /md/dashboard (see orderTrackingBasePath's module comment). */
export function DashboardView() {
  const { bundles, isLoading, isError } = useAllOrderProgress();
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [search, setSearch] = useState("");

  // Started first, then not started, then completed. Inside each bucket the
  // nearest delivery date leads.
  const sorted = useMemo(() => {
    return [...bundles].sort((a, b) => {
      const rank = BUCKET_RANK[bucketOf(a)] - BUCKET_RANK[bucketOf(b)];
      if (rank !== 0) return rank;
      const da = a.progress.daysRemaining ?? Number.POSITIVE_INFINITY;
      const db = b.progress.daysRemaining ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [bundles]);

  // Search narrows the pool first; the Started/Not Started/Completed tabs
  // (and their counts) then operate on whatever the search left behind.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (b) => b.order.ioNo.toLowerCase().includes(q) || b.order.style.toLowerCase().includes(q) || (b.order.color?.toLowerCase().includes(q) ?? false),
    );
  }, [sorted, search]);

  const counts = useMemo(() => {
    const next = { all: searched.length, started: 0, not_started: 0, completed: 0 };
    for (const b of searched) next[bucketOf(b)]++;
    return next;
  }, [searched]);

  const visible = useMemo(() => (filter === "all" ? searched : searched.filter((b) => bucketOf(b) === filter)), [searched, filter]);

  if (isLoading) return <Loader full label="Loading dashboard…" />;
  if (isError) {
    return <p className="text-sm text-status-bad">Couldn&apos;t load orders. Check the database connection.</p>;
  }

  const stats = buildFleetStats(bundles.map((b) => b.progress));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-500">Fleet-wide view of every order in production.</p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Orders" value={stats.totalOrders} icon="📦" />
          <StatCard label="On Track" value={stats.onTrack} tone="good" icon="✓" />
          <StatCard label="Due Soon" value={stats.dueSoon} tone="warn" icon="⏱" />
          <StatCard label="Delayed" value={stats.delayed} tone="bad" icon="⚠" />
          <StatCard label="Stages Completed" value={stats.totalCompletedStages} tone="brand" icon="🏁" />
          <StatCard label="Stages Pending" value={stats.totalPendingStages} tone="warn" icon="⧗" />
        </div>
      </section>

      <section>
        <Card>
          <CardHeader title="Delivery Reminders" subtitle="Nearest deadlines across every active order" />
          <CardBody>
            <DeliveryReminderList bundles={bundles} />
          </CardBody>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">All Orders</h2>
          <span className="text-xs text-ink-400">
            {visible.length} of {bundles.length} shown · in-progress orders first
          </span>
        </div>

        <Input placeholder="Search by IO number, style, or color…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-sm" />

        <FilterTabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { key: "all", label: "All", count: counts.all },
            { key: "started", label: "Started", count: counts.started },
            { key: "not_started", label: "Not Started", count: counts.not_started },
            { key: "completed", label: "Completed", count: counts.completed },
          ]}
        />

        {visible.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-sm text-ink-500">{search.trim() ? "No orders match this search." : "No orders in this category."}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((bundle) => (
              <OrderCard key={bundle.order.id} bundle={bundle} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
