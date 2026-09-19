"use client";

import type { OrderListRow } from "@/hooks/useOrdersList";
import { bucketOfOrder, ORDER_BUCKETS, type OrderBucket } from "@/lib/orderList";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { HealthOverviewCard, SummaryCard } from "@/components/ui/OverviewCards";

/**
 * The Orders page's headline numbers, in the same two-card shape as every
 * other overview: where every order stands against its delivery date (the
 * shared health bar), and how much work is on the books. Counts are over
 * every order in the list, including hidden ones - the volume card is the
 * only place hidden orders are left out, since they aren't live work.
 *
 * Both the bar's segments and the legend's tiles are filters: click one and
 * the list below narrows to just those orders.
 */
export function OrdersOverview({
  orders,
  activeBucket,
  onSelectBucket,
}: {
  orders: OrderListRow[];
  activeBucket: OrderBucket | null;
  onSelectBucket: (bucket: OrderBucket) => void;
}) {
  const counts: Record<OrderBucket, number> = { on_track: 0, due_soon: 0, overdue: 0, no_date: 0, hidden: 0 };
  for (const o of orders) counts[bucketOfOrder(o)]++;

  const live = orders.filter((o) => !o.isHidden);
  const livePcs = live.reduce((sum, o) => sum + o.totalQty, 0);
  const livePos = live.reduce((sum, o) => sum + o.purchaseOrders.length, 0);

  const segments: HealthSegment[] = ORDER_BUCKETS.map((b) => ({ ...b, count: counts[b.key], alert: b.key === "overdue" }));
  const summary = segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <HealthOverviewCard
        tone="violet"
        icon="🚚"
        title="Delivery outlook"
        subtitle="Click a status to see just those orders."
        headlineLabel="Total orders"
        headline={orders.length}
        badge={counts.overdue > 0 ? { tone: "bad", text: `${counts.overdue} overdue` } : live.length > 0 ? { tone: "good", text: "Nothing overdue" } : null}
        segments={segments}
        total={orders.length}
        ariaLabel={`Delivery outlook: ${summary}`}
        activeKey={activeBucket}
        onSelect={(key) => onSelectBucket(key as OrderBucket)}
      />

      <SummaryCard
        tone="emerald"
        icon="🧵"
        title="Order volume"
        subtitle="Across live (not hidden) orders."
        headline={livePcs.toLocaleString()}
        headlineLabel="PCS on order"
        tiles={[
          { label: "Orders", value: live.length },
          { label: "POs", value: livePos },
        ]}
      />
    </div>
  );
}
