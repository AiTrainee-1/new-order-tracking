"use client";

import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/progress";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { HealthOverviewCard } from "@/components/ui/OverviewCards";

/** Healthy to unhealthy, left to right - the order the bar and its legend
 *  both read in. Colours follow the app's status language (green done, blue
 *  moving, grey idle, amber warning, rose in trouble). */
const STATUSES: { key: OrderStatus; color: string }[] = [
  { key: "completed", color: "#059669" },
  { key: "on_track", color: "#155EEF" },
  { key: "not_started", color: "#94A3B8" },
  { key: "due_soon", color: "#F59E0B" },
  { key: "delayed", color: "#E11D48" },
];

export interface FleetOverviewProps {
  statusCounts: Record<OrderStatus, number>;
  totalOrders: number;
  /** The status the order list below is currently filtered to, if any. */
  activeStatus: OrderStatus | null;
  onSelectStatus: (status: OrderStatus) => void;
}

/**
 * Where every order in production stands: a proportional health bar with a
 * legend. Both the bar's segments and the legend's cards are filters - click
 * one and the order list below narrows to just those orders.
 */
export function FleetOverview({ statusCounts, totalOrders, activeStatus, onSelectStatus }: FleetOverviewProps) {
  const needAttention = statusCounts.due_soon + statusCounts.delayed;
  const segments: HealthSegment[] = STATUSES.map((s) => ({ ...s, label: ORDER_STATUS_LABEL[s.key], count: statusCounts[s.key], alert: s.key === "delayed" }));
  const summary = segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");

  return (
    <HealthOverviewCard
      tone="sky"
      icon="📦"
      title="Orders at a glance"
      subtitle="Click a status to see just those orders."
      headlineLabel="Orders in production"
      headline={totalOrders}
      badge={
        needAttention > 0
          ? { tone: "bad", text: `${needAttention} need${needAttention === 1 ? "s" : ""} attention` }
          : totalOrders > 0
            ? { tone: "good", text: "Nothing overdue" }
            : null
      }
      segments={segments}
      total={totalOrders}
      ariaLabel={`Order health: ${summary}`}
      activeKey={activeStatus}
      onSelect={(key) => onSelectStatus(key as OrderStatus)}
    />
  );
}
